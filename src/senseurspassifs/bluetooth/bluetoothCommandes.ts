import { messageStruct, random } from 'millegrilles.cryptography';
import { multiencoding, encryption, x25519  } from 'millegrilles.cryptography';

import CONST_SERVICES from './services.json'
import { AppWorkers } from '../../workers/workers';

const CONST_TAILLE_BUFFER_COMMANDE = 100

const bluetooth = navigator.bluetooth as Bluetooth;

export async function checkBluetoothAvailable() {
    if(bluetooth) {
        try {
            const available = await bluetooth.getAvailability()
            if(available) return true
            else return false
        } catch(err) {
            console.error("Erreur detection bluetooth ", err)
            return false
        }
    } else {
        return false
    }
}

export async function requestDevice(): Promise<BluetoothDevice | null> {
    let device = null as BluetoothDevice | null;
    
    const configurerUuid = CONST_SERVICES.services.commandes.uuid,
          etatUuid  = CONST_SERVICES.services.etat.uuid,
          environmentalUuid = 0x181a;

    console.debug("Services %s, %s", configurerUuid, etatUuid)
    try {
        device = await bluetooth?.requestDevice({
            // Requis : service de configuration
            // filters: [{services: [etatUuid]}],
            filters: [{services: [configurerUuid]}],
            // Optionnels - requis par Chrome sur Windows (permission d'acces)
            // optionalServices: [configurerUuid, environmentalUuid],
            optionalServices: [etatUuid, environmentalUuid],
        });
    } catch(err: any) {
        if(err.code === 8) {
            // Cancel
            return null;
        }
        // Reessayer sans optionalServices (pour navigateur bluefy)
        device = await bluetooth.requestDevice({
            // Requis : service de configuration
            filters: [{services: [configurerUuid, etatUuid]}],
        });
    }
    console.debug("Device choisi ", device)
    return device
}

export async function authentifier(workers: AppWorkers, server: BluetoothRemoteGATTServer) {
    // Recuperer la cle publique de l'appareil
    const publicPeerDataview = await chargerClePublique(server);
    const publicPeer = new Uint8Array(publicPeerDataview.buffer);
    console.debug("Cle publique peer pour auth ", publicPeer);

    // Generer keypair pour le chiffrage des commandes
    // const keyPair = genererKeyPairX25519();
    let keyPair = await x25519.generateX25519KeyPair();
    // const publicString = Buffer.from(keyPair.public).toString('hex');
    const publicString = multiencoding.encodeHex(keyPair.publicKey);
    console.debug("Keypair : %O, public %s", keyPair, publicString);

    // Calculer shared secret
    // const sharedSecret = await calculerSharedKey(keyPair.private, publicPeer);
    const sharedSecret = await x25519.sharedSecretFromX22519(keyPair.privateKey, publicPeer);
    // console.debug("Shared secret : %s %O", Buffer.from(sharedSecret).toString('hex'), sharedSecret)

    const now = Math.floor(new Date().getTime()/1000);
    const duree = 1_200;  // 20 minutes - le message d'authentification est valide pour la duree maximale d'une connexion
    const expiration = now + duree;

    // Transmettre cle publique
    const commande = {pubkey: publicString, "exp": expiration};
    const commandeSignee = await workers.connection.createRoutedMessage(
        messageStruct.MessageKind.Command, commande, {domaine: 'SenseursPassifs', action: 'authentifier'}
    );
    const cbSubmit = async (characteristic: BluetoothRemoteGATTCharacteristic) => {
        await transmettreDict(characteristic, commandeSignee)
    };
    const commandeUuid = CONST_SERVICES.services.commandes.uuid,
          setCommandUuid = CONST_SERVICES.services.commandes.characteristics.setCommand,
          getAuthUuid = CONST_SERVICES.services.commandes.characteristics.getAuth;

    const fingerprint = commandeSignee.pubkey;

    let authHandler = null as null | ((e?: any) => void);
    const succes = await new Promise( async (resolve, reject) => {
        const polling = async () => {
            try {
                // Verifier que la characteristic auth est vide (len: 0). Indique succes.
                console.debug("Fingerprint certificat signature : ", fingerprint);
                for(let i=0; i<3; i++) {
                    const confirmation = await chargerClePublique(server);
                    // const confirmationKeyString = Buffer.from(confirmation.buffer).toString('hex')
                    const confirmationKeyString = multiencoding.encodeHex(confirmation.buffer);
                    console.debug("Confirmation auth : %s (%O)", confirmationKeyString, confirmation);
                    if(confirmationKeyString === fingerprint) {
                        console.debug("Auth succes");
                        return resolve(true);
                    }
                    // Sleep
                    if(i<2) await new Promise(resolveSleep=>setTimeout(resolveSleep, 1_500));
                }
                return resolve(false);
            } catch(err) {
                reject(err);
            }
        }

        let timeoutPolling = null as any;

        authHandler = (e: any) => {
            console.debug("Event auth : ", e);
            try {
                const value = e.currentTarget.value;
                // const confirmationKeyString = Buffer.from(value.buffer).toString('hex');
                const confirmationKeyString = multiencoding.encodeHex(value.buffer);
                if(fingerprint === confirmationKeyString) {
                    console.debug("Auth reussie");
                    resolve(true);
                    if(timeoutPolling) clearTimeout(timeoutPolling);  // Annuler polling
                }
            } catch(err) {
                console.error("Erreur authHandler ", err);
            }
        }

        // Ecouter evenements auth
        await addEventListener(server, commandeUuid, getAuthUuid, authHandler);
        
        // Soumettre l'authentification
        await submitParamAppareil(server, commandeUuid, setCommandUuid, cbSubmit);

        // Donner une change au listener. Commencer a poller apres 5 secondes
        timeoutPolling = setTimeout(polling, 5_000) as any;
    })
    .finally(async () => {
        if(authHandler) {
            await removeEventListener(server, commandeUuid, getAuthUuid, authHandler);
        }
    })

    if(succes) {
        // Sauvegarder le shared secret pour activer les commandes authentifiees.
        return { sharedSecret };
    } else {
        console.error("Echec authentification");
    }    
}

export async function chargerEtatAppareil(server: BluetoothRemoteGATTServer): Promise<DeviceState> {
    try {
        if(!server.connected) {
            throw new Error("GATT connection - failure");
        }
        const service = await server.getPrimaryService(CONST_SERVICES.services.etat.uuid)
        // console.debug("Service : ", service)
        const characteristics = await service.getCharacteristics()
        const etat = await lireEtatCharacteristics(characteristics)

        return etat;
    } catch(err) {
        console.error("Erreur chargerEtatAppareil %O", err)
    }
    throw new Error("GATT state loading - failure");
}

async function chargerClePublique(server: BluetoothRemoteGATTServer): Promise<DataView> {
    if(!server.connected) {
        throw new Error("GATT connection - failed");
    }
    const service = await server.getPrimaryService(CONST_SERVICES.services.commandes.uuid);
    const characteristics = await service.getCharacteristics();
    
    for await(const characteristic of characteristics) {
        // console.debug("Lire characteristic " + characteristic.uuid)
        const uuidLowercase = characteristic.uuid.toLowerCase();
        switch(uuidLowercase) {
            case CONST_SERVICES.services.commandes.characteristics.getAuth:
                return await characteristic.readValue();
            default:
        }
    }

    throw Error('characteristic auth not found');
}

export type SwitchState = { present: boolean, valeur: boolean };

export type DeviceState = {
    userId?: string, idmg?: string, 
    connected?: boolean, status?: number, channel?: number, ip?: string, subnet?: string, gateway?: string,  dns?: string, ssid?: string,
    ntp?: boolean, time?: number, temp1?: number, temp2?: number, hum?: number, switches?: Array<SwitchState>
}

async function lireEtatCharacteristics(characteristics: BluetoothRemoteGATTCharacteristic[]): Promise<DeviceState> {
    // console.debug("Nombre characteristics : " + characteristics.length)
    const etat = {} as DeviceState;
    for await(const characteristic of characteristics) {
        // console.debug("Lire characteristic " + characteristic.uuid)
        const uuidLowercase = characteristic.uuid.toLowerCase()
        switch(uuidLowercase) {
            case CONST_SERVICES.services.etat.characteristics.getUserId:
                etat.userId = await readTextValue(characteristic)
                break
            case CONST_SERVICES.services.etat.characteristics.getIdmg:
                etat.idmg = await readTextValue(characteristic)
                break
            case CONST_SERVICES.services.etat.characteristics.getWifi:
                Object.assign(etat, await readWifi(characteristic))
                break
            case CONST_SERVICES.services.etat.characteristics.getLectures:
                Object.assign(etat, await readLectures(characteristic))
                break
            default:
                console.warn("Characteristic etat inconnue : " + characteristic.uuid)
        }
    }
    return etat
}

async function readTextValue(characteristic: BluetoothRemoteGATTCharacteristic): Promise<string> {
    const value = await characteristic.readValue()
    return new TextDecoder().decode(value)
}

function convertirBytesIp(adresse: Uint8Array): string {
    let adresseStr = adresse.join('.')
    return adresseStr
}

async function readWifi(characteristic: BluetoothRemoteGATTCharacteristic) {
    const value = await characteristic.readValue()
    console.debug("readWifi value %O", value)
    return decoderWifi(value)
}

export function decoderWifi(value: DataView) {
    const connected = value.getUint8(0) === 1,
          status = value.getUint8(1),
          channel = value.getUint8(2)
    const adressesSlice = value.buffer.slice(3, 19)
    const adressesList = new Uint8Array(adressesSlice)
    const ip = convertirBytesIp(adressesList.slice(0, 4))
    const subnet = convertirBytesIp(adressesList.slice(4, 8))
    const gateway = convertirBytesIp(adressesList.slice(8, 12))
    const dns = convertirBytesIp(adressesList.slice(12, 16))

    const ssidBytes = value.buffer.slice(19)
    const ssid = new TextDecoder().decode(ssidBytes)

    const etatWifi = {
        connected,
        status,
        channel,
        ip, subnet, gateway, dns,
        ssid
    }

    return etatWifi
}

async function readLectures(characteristic: BluetoothRemoteGATTCharacteristic) {
    const value = await characteristic.readValue()
    console.debug("readLectures value %O", value)
    return decoderLectures(value)
}

export function decoderLectures(value: DataView) {
    // Structure du buffer:
    // 0: NTP OK true/false
    // 1-4: int date epoch (secs)
    // 5-6: temp1 (small int)
    // 7-8: temp2 (small int)
    // 9-10: hum (small int)
    // 11: switch 1,2,3,4 avec bits 0=switch1 present, 1=switch1 ON/OFF, 2=switch2 present ...

    const etatNtp = value.getUint8(0) === 1
    const timeSliceVal = new Uint32Array(value.buffer.slice(1, 5))
    // console.debug("Time slice val ", timeSliceVal)
    const timeVal = timeSliceVal[0]
    const dateTime = new Date(timeVal * 1000)
    // console.debug("Time val : %O, Date %O", timeVal, dateTime)

    const lecturesNumeriques = new Int16Array(value.buffer.slice(5, 11))
    const temp1 = decoderValeurSmallint(lecturesNumeriques[0]),
          temp2 = decoderValeurSmallint(lecturesNumeriques[1]),
          hum = decoderValeurSmallint(lecturesNumeriques[2],{facteur: 10.0})

    const switches = decoderSwitches(value.getUint8(11))

    return {ntp: etatNtp, time: timeVal, temp1, temp2, hum, switches}
}

function decoderValeurSmallint(val: number, opts?: {facteur?: number}) {
    opts = opts || {}
    const facteur = opts.facteur || 100.0
    if(val === -32768) return undefined;
    return val / facteur
}

function decoderSwitches(val: number) {
    const valeursListe = []
    for(let i = 0; i < 8; i++) {
        const boolVal = (val & 1 << i)?1:0
        valeursListe.push(boolVal)
    }
    // console.debug("Valeurs liste : ", valeursListe)
    const switches = []
    for(let sw=0; sw < 4; sw++) {
        const switchValue = {present: valeursListe[2*sw]?true:false} as SwitchState;
        if(switchValue.present) {
            switchValue.valeur = valeursListe[2*sw+1]?true:false
        }
        switches.push(switchValue)
    }
    return switches
}

async function transmettreString(characteristic: BluetoothRemoteGATTCharacteristic, valeur: string) {
    const endValue = new Uint8Array(1);
    endValue.set([0x0], 0);

    let valeurArray = new TextEncoder().encode(valeur);

    while(valeurArray.length > 0) {
        let valSlice = valeurArray.slice(0, CONST_TAILLE_BUFFER_COMMANDE);
        valeurArray = valeurArray.slice(CONST_TAILLE_BUFFER_COMMANDE);
        await characteristic.writeValueWithResponse(valSlice);
    }

    // Envoyer char 0x0
    await characteristic.writeValueWithResponse(endValue);
}

export async function transmettreDict(characteristic: BluetoothRemoteGATTCharacteristic, valeur: Object) {
    return transmettreString(characteristic, JSON.stringify(valeur));
}

async function submitParamAppareil(server: BluetoothRemoteGATTServer, serviceUuid: BluetoothServiceUUID, characteristicUuid: string, 
    callback: (e: any)=>Promise<void>) 
{
    if(!server) throw new Error("Server manquant")
    if(!serviceUuid) throw new Error('serviceUuid vide')
    if(!characteristicUuid) throw new Error('characteristicUuid vide')

    console.debug("submitParamAppareil serviceUuid %s, characteristicUuid %s", serviceUuid, characteristicUuid)

    try {
        if(!server.connected) {
            console.error("GATT connexion - echec")
            return
        }
        console.debug("GATT server ", server)
        const service = await server.getPrimaryService(serviceUuid)
        console.debug("GATT service ", service)
        
        const characteristic = await service.getCharacteristic(characteristicUuid.toLowerCase())
        await callback(characteristic)

    } catch(err) {
        console.error("Erreur chargerEtatAppareil %O", err)
    }
}

export async function addEventListener(
    server: BluetoothRemoteGATTServer, serviceUuid: string, characteristicUuid: string, 
    callback: (event: any) => void) 
{
    if(!server) throw new TypeError("Server manquant");
    if(!serviceUuid) throw new TypeError('serviceUuid vide');
    if(!characteristicUuid) throw new TypeError('characteristicUuid vide');
    if(!callback) throw new TypeError('callback vide');

    console.debug("addEventListener serviceUuid %s, characteristicUuid %s", serviceUuid, characteristicUuid)
    if(!server.connected) {
        console.error("GATT connexion - echec");
        return;
    }

    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid.toLowerCase());

    // characteristic.oncharacteristicvaluechanged = callback
    const c = await characteristic.startNotifications();
    if(c) {
        characteristic.addEventListener('characteristicvaluechanged', callback);
        console.debug("addEventListener Characteristic %O notification active", characteristic);
    } else {
        throw new Error("addEventListener erreur startNotifications");
    }
}

export async function removeEventListener(server: BluetoothRemoteGATTServer, serviceUuid: string, characteristicUuid: string, callback: (e?: any)=>void) 
{
    if(!server) throw new TypeError("Server manquant")
    if(!serviceUuid) throw new TypeError('serviceUuid vide')
    if(!characteristicUuid) throw new TypeError('characteristicUuid vide')

    console.debug("removeEventListener serviceUuid %s, characteristicUuid %s", serviceUuid, characteristicUuid)
    if(!server.connected) {
        console.error("GATT connexion - echec")
        return;
    }

    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid.toLowerCase());
    console.debug("removeEventListener Characteristic %O", characteristic);

    const c = await characteristic.stopNotifications();
    c.removeEventListener('characteristicvaluechanged', callback);
}

export async function transmettreDictChiffre(workers: AppWorkers, server: BluetoothRemoteGATTServer, authSharedSecret: Uint8Array, commande: Object) {
    let commandeString = JSON.stringify(commande)
    let commandeBytes = new TextEncoder().encode(commandeString)
    let nonce = random.getRandom(12);

    // const resultat = await workers.chiffrage.chiffrage.chiffrer(
    //     commandeBytes, {cipherAlgo: 'chacha20-poly1305', key: authSharedSecret}
    // )
    let ciphertext = await encryption.encryptChacha20Poly1305(commandeBytes, nonce, authSharedSecret);
    let tag = ciphertext.slice(ciphertext.length-16);  // Compute tag
    ciphertext = ciphertext.slice(0, ciphertext.length-16);  // Separate compute tag
    console.debug("Commande chiffree : %O (key input: %O)", ciphertext, authSharedSecret)
    // let ciphertext = Buffer.from(resultat.ciphertext).toString('base64');
    let commandeChiffree = {
        ciphertext: multiencoding.encodeBase64(ciphertext),
        nonce: multiencoding.encodeBase64(nonce),  //  Buffer.from(resultat.nonce.slice(1), 'base64').toString('base64'),
        tag: multiencoding.encodeBase64(tag),      // Buffer.from(resultat.rawTag).toString('base64'),
    };
    const cb = async (characteristic: BluetoothRemoteGATTCharacteristic) => {
        await transmettreDict(characteristic, commandeChiffree);
    }
    let commandeUuid = CONST_SERVICES.services.commandes.uuid,
        setCommandUuid = CONST_SERVICES.services.commandes.characteristics.setCommand;

    await submitParamAppareil(server, commandeUuid, setCommandUuid, cb);
}

export async function submitConfiguration(server: BluetoothRemoteGATTServer, relai: string, idmg: string, userId: string) {
    const commandesUuid = CONST_SERVICES.services.commandes.uuid,
          setCommandUuid = CONST_SERVICES.services.commandes.characteristics.setCommand

    // Transmettre relai
    const cbRelai = async (characteristic: BluetoothRemoteGATTCharacteristic) => {
        const params = {commande: 'setRelai', relai};
        await transmettreDict(characteristic, params);
    }
    const cbUser = async (characteristic: BluetoothRemoteGATTCharacteristic) => {
        const params = {commande: 'setUser', idmg, user_id: userId};
        await transmettreDict(characteristic, params);
    }

    await submitParamAppareil(server, commandesUuid, setCommandUuid, cbRelai);
    console.debug("Params relai envoyes");
    await submitParamAppareil(server, commandesUuid, setCommandUuid, cbUser);
    console.debug("Params user envoyes");
}

export async function submitWifi(server: BluetoothRemoteGATTServer, ssid: string, wifiPassword: string) {
    const cb = async (characteristic: BluetoothRemoteGATTCharacteristic) => {
        const params = {commande: 'setWifi', ssid, password: wifiPassword};
        await transmettreDict(characteristic, params);
    }

    const commandeUuid = CONST_SERVICES.services.commandes.uuid,
          setCommandUuid = CONST_SERVICES.services.commandes.characteristics.setCommand;

    await submitParamAppareil(server, commandeUuid, setCommandUuid, cb);
}
