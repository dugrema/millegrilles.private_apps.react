import { ChangeEvent, Dispatch, useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Formatters } from 'millegrilles.reactdeps.typescript';

import { 
        chargerEtatAppareil, checkBluetoothAvailable, requestDevice,
        submitConfiguration as bleSubmitConfiguration, submitWifi as bleSubmitWifi,
        transmettreDictChiffre, 
        authentifier as bleAuthentifier,
        decoderLectures as bleDecoderLectures, decoderWifi as bleDecoderWifi,
        addEventListener as bleAddEventListener, removeEventListener as bleRemoveEventListener,
        SwitchState
    } from "./bluetoothCommandes"
import useWorkers from "../../workers/workers";
import useBluetoothStore from "./bluetoothStore";

import CONST_BLUETOOTH_SERVICES from './services.json';
import useConnectionStore from "../../connectionStore";

export default function BluetoothConfiguration() {

    let bluetoothAvailable = useBluetoothStore(state=>state.bluetoothAvailable);

    return (
        <>
            <h1>Bluetooth configuration</h1>

            <BluetoothAvailableCheck />

            {bluetoothAvailable?<BluetoothDevicesSection />:<></>}

            <div>
                <nav>
                    <Link to='/apps/senseurspassifs/devices'
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            Back
                    </Link>
                </nav>
            </div>
            
        </>
    )
}

export function BluetoothAvailableCheck(props: {hide?: boolean}) {

    let [done, setDone] = useState(false);
    // let setAvailable = props.setAvailable;
    let available = useBluetoothStore(state=>state.bluetoothAvailable);
    let setBluetoothAvailable = useBluetoothStore(state=>state.setBluetoothAvailable);

    useEffect(()=>{
        if(done) return;
        if(available) {
            setDone(true);
            return;  // Check already done
        }
        checkBluetoothAvailable()
            .then(result=>{
                console.debug("Bluetooth available : ", result);
                setBluetoothAvailable(result);
            })
            .catch(err=>console.error("Error checking if Bluetooth is avaiable", err))
            .finally(()=>setDone(true));
    }, [available, setDone, setBluetoothAvailable]);

    if(props.hide) return <></>;

    if(!done) return <div>Checking if Bluetooth is available</div>;
    if(!available) {
        return (
            <div>Bluetooth is not available.</div>
        )
    }

    return <></>;
}

function BluetoothDevicesSection() {

    let [wifi, setWifi] = useState('');
    let [wifiPassword, setWifiPassword] = useState('');
    let [relayUrl, setRelayUrl] = useState('');

    let wifiChangeHandler = useCallback( (e: ChangeEvent<HTMLInputElement>) => setWifi(e.currentTarget.value), [setWifi]);
    let wifiPasswordChangeHandler = useCallback( (e: ChangeEvent<HTMLInputElement>) => setWifiPassword(e.currentTarget.value), [setWifiPassword]);
    let relayUrlChangeHandler = useCallback( (e: ChangeEvent<HTMLInputElement>) => setRelayUrl(e.currentTarget.value), [setRelayUrl]);

    let [selectedDevice, setSelectedDevice] = useState(undefined as BluetoothDevice | undefined);

    // Initialize default relay url with current window
    useEffect(()=>{
        const relayUrl = new URL(window.location.href);
        relayUrl.pathname = '';
        setRelayUrl(relayUrl.href);
    }, [setRelayUrl]);
    
    useEffect(()=>{
        if(!selectedDevice?.gatt) return;
        selectedDevice.addEventListener('gattserverdisconnected', ()=>{
            console.warn("GATT server disconnected");
            setSelectedDevice(undefined);
        })
    }, [selectedDevice, setSelectedDevice]);

    return (
        <>
            <h1>Device configuration</h1>
            <section>
                <h2>Connection</h2>
                <div className="grid grid-cols-12">
                    <label htmlFor="wifissid" className="col-span-3">WIFI</label>
                    <input id="wifissid" type="text" onChange={wifiChangeHandler} value={wifi} className="col-span-6 text-black" />
                    <div className="col-span-3"></div>
                    <label htmlFor="wifipassword" className="col-span-3">WIFI Password</label>
                    <input id="wifipassword" type="password" onChange={wifiPasswordChangeHandler} value={wifiPassword} className="col-span-6 text-black" />
                    <div className="col-span-3"></div>
                    <p className="col-span-12">Server connection URL.</p>
                    <label htmlFor="serverurl" className="col-span-3">Server URL</label>
                    <input id="serverurl" type="url" onChange={relayUrlChangeHandler} value={relayUrl} className="col-span-6 text-black" />
                    <div className="col-span-3"></div>
                </div>
            </section>

            <section>
                <h2>Device</h2>

                <DeviceScan 
                    selectedDevice={selectedDevice} 
                    setSelectedDevice={setSelectedDevice} />

                <DeviceConnection 
                    selectedDevice={selectedDevice} 
                    wifi={wifi} 
                    wifiPassword={wifiPassword}
                    relayUrl={relayUrl} />
            </section>
        </>
    )
}

type DeviceScanProps = {
    selectedDevice?: BluetoothDevice,
    setSelectedDevice: Dispatch<BluetoothDevice|undefined>,
};

function DeviceScan(props: DeviceScanProps) {

    let { setSelectedDevice } = props;
    const scanCb = useCallback(()=>{
        console.debug("Request device")
        requestDevice()
            .then(device=>{
                if(!device) return  // Cancelled
                setSelectedDevice(device)
            })
            .catch(err=>console.error("Erreur chargement device ", err))
    }, [setSelectedDevice])

    let disconnectHandler = useCallback(()=>setSelectedDevice(undefined), [setSelectedDevice]);

    if(props.selectedDevice) return (
        <>
            <button onClick={disconnectHandler} 
                className='btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500'>
                    Disconnect
            </button>
        </>
    );

    return (
        <>
            <p>Le boutons suivant permet de trouver un appareil avec bluetooth.</p>
            <div>
                <button onClick={scanCb} className='btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500'>
                    Scan
                </button>
            </div>
        </>
    )
}

type DeviceConnectionProps = {
    selectedDevice?: BluetoothDevice,
    wifi: string,
    wifiPassword: string,
    relayUrl: string,
};

function DeviceConnection(props: DeviceConnectionProps) {

    let { selectedDevice, wifi, wifiPassword, relayUrl } = props;

    let [bluetoothGattServer, setBluetoothGattServer] = useState(undefined as BluetoothRemoteGATTServer | undefined);

    useEffect(()=>{
        let server: BluetoothRemoteGATTServer;
        if(selectedDevice?.gatt) {
            // Se connecter
            console.debug("Connexion bluetooth a %O", selectedDevice)
            selectedDevice.gatt.connect()
                .then(gattServer=>{
                    setBluetoothGattServer(gattServer);
                    server = gattServer;
                })
                .catch(err=>console.error("Erreur connexion bluetooth", err))

            // Connection cleanup
            return () => {
                if(server) {
                    console.debug("Deconnexion bluetooth de %O", server);
                    setBluetoothGattServer(undefined);
                    server.disconnect();
                }
            }
        }
    }, [selectedDevice, setBluetoothGattServer]);

    if(!bluetoothGattServer) return <></>;  // Hide

    return (
        <>
            <DeviceDetail server={bluetoothGattServer} />
            <SubmitConfiguration 
                server={bluetoothGattServer} 
                ssid={wifi} 
                wifiPassword={wifiPassword} 
                relayUrl={relayUrl} />
        </>
    );
}

type DeviceDetailProps = {
    server: BluetoothRemoteGATTServer,
}

function DeviceDetail(props: DeviceDetailProps) {

    let { server } = props;
    let workers = useWorkers();
    
    let [listenersRegistered, setListenersRegistered] = useState(false);
    let [sharedSecret, setAuthSharedSecret] = useState(null as Uint8Array | null);
    let [refreshing, setRefreshing] = useState(false);

    let mergeDeviceState = useBluetoothStore(state=>state.mergeDeviceState);
    let stateLoaded = useBluetoothStore(state=>state.stateLoaded);
    let clearDeviceState = useBluetoothStore(state=>state.clear);

    const refreshDevice = useCallback(()=>{
        if(!server.connected) {
            console.warn("Connexion bluetooth coupee")
            // fermer()
            return;
        }
        setRefreshing(true);
        console.debug("refreshDevice");
        chargerEtatAppareil(server)
            .then(etat=>{
                console.debug("Etat appareil %O", etat)
                // setEtatAppareil(etat)
                mergeDeviceState(etat);
            })
            .catch(err=>{
                console.debug("Erreur chargement etat appareil ", err)
                // fermer()
            })
            .finally(()=>{
                setRefreshing(false);
            })
    }, [server, setRefreshing]);

    const updateLecturesHandler = useCallback( (e: any) => {
        console.debug("updateLecturesHandler Event lectures : ", e)
        try {
            const valeur = e.target.value
            const etatLectures = bleDecoderLectures(valeur)
            // console.debug("Lectures decode : ", etatLectures)
            mergeDeviceState(etatLectures)
        } catch(err) {
            console.error("Erreur decodage lectures ", err)
        }
    }, [mergeDeviceState])

    const updateWifiHandler = useCallback((e: any) => {
        console.debug("Event wifi : ", e)
        try {
            const valeur = e.target.value
            const etatWifi = bleDecoderWifi(valeur)
            // console.debug("Wifi decode : ", etatWifi)
            mergeDeviceState(etatWifi)
        } catch(err) {
            console.error("Erreur decodage lectures ", err)
        }
    }, [mergeDeviceState])    


    useEffect(()=>{
        // Cleanup when changing device
        return () => {
            clearDeviceState();
        }
    }, [clearDeviceState]);

    useEffect(()=>{
        if(listenersRegistered) return;  // Using listeners instead of polling

        // Refresh and start polling
        refreshDevice();
        let intervalRefresh = setInterval(refreshDevice, 7_500);
        return () => {
            if(intervalRefresh) clearInterval(intervalRefresh);
        }
    }, [refreshDevice, listenersRegistered]);

    useEffect(()=>{
        if(server?.connected && stateLoaded) {
            const etatUuid = CONST_BLUETOOTH_SERVICES.services.etat.uuid
            const lecturesUuid = CONST_BLUETOOTH_SERVICES.services.etat.characteristics.getLectures
            const wifiUuid = CONST_BLUETOOTH_SERVICES.services.etat.characteristics.getWifi
            bleAddEventListener(server, etatUuid, lecturesUuid, updateLecturesHandler)
                .then(()=>bleAddEventListener(server, etatUuid, wifiUuid, updateWifiHandler))
                .then(()=>setListenersRegistered(true))
                .catch(err=>console.error("Erreur ajout listener sur lectures/wifi", err))
    
            return () => {
                setListenersRegistered(false);
                bleRemoveEventListener(server, etatUuid, lecturesUuid, updateLecturesHandler)
                    .catch(err=>console.error("Erreur retrait listener sur lectures", err));
                bleRemoveEventListener(server, etatUuid, wifiUuid, updateWifiHandler)
                    .catch(err=>console.error("Erreur retrait listener sur lectures", err));
            }
        }
    }, [server, stateLoaded, updateLecturesHandler, updateWifiHandler, setListenersRegistered])

    const authentifierHandler = useCallback(()=>{
        if(!workers) throw new Error("Workers not initialized");
        if(!listenersRegistered || refreshing) return;  // Wait for listener registration

        setAuthSharedSecret(null);
        bleAuthentifier(workers, server)
            .then(result=>{
                console.debug("Authentifier resultat : ", result)
                if(result && result.sharedSecret) {
                    setAuthSharedSecret(result.sharedSecret)
                } else {
                    setAuthSharedSecret(null);
                }
            })
            .catch(err=>{
                console.error("Erreur BLE authentifier ", err)
                setAuthSharedSecret(null);
            })
    }, [workers, server, refreshing, listenersRegistered, setAuthSharedSecret]);

    useEffect(()=>{
        if(server && server.connected) authentifierHandler();
    }, [server, authentifierHandler])

    return (
        <>
            <ShowDeviceState />
            <ShowDeviceReadings server={server} authSharedSecret={sharedSecret}/>
        </>
    );
}

function ShowDeviceState() {
    let deviceState = useBluetoothStore(state=>state.deviceState);
    if(!deviceState.userId) return <></>;

    return (
        <div className="grid grid-cols-12">
            <div className="col-span-3">Idmg</div>
            <div className="col-span-9">{deviceState.idmg}</div>

            <div className="col-span-3">User id</div>
            <div className="col-span-9">{deviceState.userId}</div>

            <div className="col-span-3">WIFI</div>
            <div className="col-span-9">{deviceState.ssid}</div>

            <div className="col-span-3">Ip address</div>
            <div className="col-span-9">{deviceState.ip}</div>

            <div className="col-span-3">Subnet</div>
            <div className="col-span-9">{deviceState.subnet}</div>

            <div className="col-span-3">Gateway</div>
            <div className="col-span-9">{deviceState.gateway}</div>

            <div className="col-span-3">DNS</div>
            <div className="col-span-9">{deviceState.dns}</div>
        </div>
    )
}

type DeviceReadingsProps = {
    server: BluetoothRemoteGATTServer,
    authSharedSecret: Uint8Array | null,
};

function ShowDeviceReadings(props: DeviceReadingsProps) {
    const { server, authSharedSecret } = props

    let deviceState = useBluetoothStore(state=>state.deviceState);
    if(!deviceState?.userId) return <></>;

    return (
        <div>
            <p></p>

            <div>Ntp sync</div><div>{deviceState.ntp?'Oui':'Non'}</div>
            <div>Heure</div><div><Formatters.FormatterDate value={deviceState.time}/></div>
            <Temperature value={deviceState.temp1} label='Temperature 1' />
            <Temperature value={deviceState.temp2} label='Temperature 2' />
            <Humidity value={deviceState.hum} />
            {deviceState.switches?
                <>
                    <SwitchBluetooth value={deviceState.switches[0]} idx={0} label='Switch 1' server={server} authSharedSecret={authSharedSecret} />
                    <SwitchBluetooth value={deviceState.switches[1]} idx={1} label='Switch 2' server={server} authSharedSecret={authSharedSecret} />
                    <SwitchBluetooth value={deviceState.switches[2]} idx={2} label='Switch 3' server={server} authSharedSecret={authSharedSecret} />
                    <SwitchBluetooth value={deviceState.switches[3]} idx={3} label='Switch 4' server={server} authSharedSecret={authSharedSecret} />
                </>
            :<></>}
        </div>
    )
}

type ReadingProps = {value?: number, label?: string};

function Temperature(props: ReadingProps) {
    const { value, label } = props

    if(!value) return <></>;

    return (
        <><div>{label||'Temperature'}</div><div>{value}&deg;C</div></>
    )
}

function Humidity(props: ReadingProps) {
    const { value, label } = props

    if(!value) return <></>;

    return (
        <><div>{label||'Humidity'}</div><div>{value}%</div></>
    )
}

type SwitchReadingProps = {
    value: SwitchState,
    label: string,
    server: BluetoothRemoteGATTServer,
    idx: number,
    authSharedSecret?: Uint8Array | null,
};


function SwitchBluetooth(props: SwitchReadingProps) {
    const { value, label, idx, server, authSharedSecret } = props

    const workers = useWorkers()

    const commandeSwitchCb = useCallback((e: any)=>{
        if(!workers) throw new Error("Workers not initialized");
        if(!authSharedSecret) throw new Error("Not authorized to toggle switch");
        const { name, value } = e.currentTarget
        const idx = Number.parseInt(name)
        const valeur = value==='1'
        const commande = { commande: 'setSwitchValue', idx, valeur }
        transmettreDictChiffre(workers, server, authSharedSecret, commande)
            .then(()=>{
                console.debug("Commande switch transmise")
            })
            .catch(err=>console.error("Erreur switch BLE : ", err))
    }, [workers, idx, server, authSharedSecret])

    if(!value.present) return <></>;

    return (
        <>
            <div>{label||'Switch'}</div>
            <div>{value.valeur?'ON':'OFF'}</div>
            <div>
                <button name={''+idx} value="1" onClick={commandeSwitchCb} disabled={!authSharedSecret}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        ON
                </button>
                <button name={''+idx} value="0" onClick={commandeSwitchCb} disabled={!authSharedSecret}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        OFF
                </button>
            </div>
        </>
    )
}

type SubmitConfigurationProps = {
    server: BluetoothRemoteGATTServer,
    ssid: string,
    wifiPassword: string,
    relayUrl: string,
};

function SubmitConfiguration(props: SubmitConfigurationProps) {

    let { server, ssid, wifiPassword, relayUrl } = props;

    let workers = useWorkers();

    let idmg = useConnectionStore(state=>state.idmg);

    // Load userId from ceritificate
    let [userId, setUserId] = useState('');
    useEffect(()=>{
        workers?.connection.getMessageFactoryCertificate()
            .then(certificate=>{
                let userId = certificate.extensions?.userId;
                if(userId) setUserId(userId);
            })
            .catch(err=>console.error("Error loading userId from certificate", err));
    }, [workers, setUserId])


    const submitConfigurationServer = useCallback((e: any) => {
        console.debug("Submit usager ", e)
        e.stopPropagation()
        e.preventDefault()

        bleSubmitConfiguration(server, relayUrl, idmg, userId)
            .then(()=>{
                console.debug("Params configuration envoyes")
                // messageSuccesCb('Les parametres serveur ont ete transmis correctement.')
            })
            .catch(err=>{
                console.error("Erreur sauvegarde parametres serveur", err)
                // setMessageErreur({err, message: 'Les parametres serveur n\'ont pas ete recus par l\'appareil.'})
            })
    }, [server, idmg, userId, relayUrl])

    let submitWifi = useCallback((e: any)=>{
        console.debug("Submit wifi ", e)
        e.stopPropagation()
        e.preventDefault()

        bleSubmitWifi(server, ssid, wifiPassword)
            .then(()=>{
                // messageSuccesCb('Les parametres wifi ont ete transmis correctement.')
            })
            .catch(err=>{
                console.error("Erreur submit wifi ", err)
                // setMessageErreur({err, message: 'Les parametres wifi n\'ont pas ete recus par l\'appareil.'})
            })
    }, [server, ssid, wifiPassword])

    return (
        <div>
            <br/>
            <p>Utilisez les boutons suivants pour modifier la configuration de l'appareil.</p>
            <button onClick={submitWifi} disabled={!ssid||!wifiPassword}
                className="btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500">
                    Changer wifi
            </button>
            <button onClick={submitConfigurationServer} disabled={!relayUrl}
                className="btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500">
                    Configurer serveur
            </button>
            <p></p>
        </div>
    )
}
