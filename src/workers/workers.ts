import {certificates} from "millegrilles.cryptography";
import { Remote, wrap } from 'comlink';

import { ConnectionCallbackParameters } from 'millegrilles.reactdeps.typescript';

import { AppsConnectionWorker } from "./connection.worker";
import { AppsEncryptionWorker } from './encryption.worker';

export type AppWorkers = {
    connection: Remote<AppsConnectionWorker>,
    encryption: Remote<AppsEncryptionWorker>,
};

const SOCKETIO_PATH = '/millegrilles/socket.io';

let workers: AppWorkers | null = null;

function useWorkers() {
    return workers;
}

export default useWorkers;

export type InitWorkersResult = {
    idmg: string,
    ca: string,
    chiffrage: Array<Array<string>>,
    workers: AppWorkers,
}

export async function initWorkers(callback: (params: ConnectionCallbackParameters) => void): Promise<InitWorkersResult> {

    let {idmg, ca, chiffrage} = await loadFiche();

    let connectionWorker = new Worker(new URL('./connection.worker.ts', import.meta.url));
    let connection = wrap(connectionWorker) as Remote<AppsConnectionWorker>;

    let encryptionWorker = new Worker(new URL('./encryption.worker.ts', import.meta.url));
    let encryption = wrap(encryptionWorker) as Remote<AppsEncryptionWorker>;

    // Set-up the workers
    let serverUrl = new URL(window.location.href);
    serverUrl.pathname = SOCKETIO_PATH;
    await connection.initialize(serverUrl.href, ca, callback, {reconnectionDelay: 7500});
    await encryption.initialize(ca);
    await encryption.setEncryptionKeys(chiffrage);

    workers = {connection, encryption};

    return {idmg, ca, chiffrage, workers};
}

type LoadFicheResult = {
    ca: string,
    idmg: string,
    chiffrage: Array<Array<string>>,
}

async function loadFiche(): Promise<LoadFicheResult> {
    let ficheResponse = await fetch('/fiche.json');
    if(ficheResponse.status !== 200) {
        throw new Error(`Loading fiche.json, invalid response (${ficheResponse.status})`)
    }
    let fiche = await ficheResponse.json();

    let content = JSON.parse(fiche['contenu']);
    let {idmg, ca, chiffrage} = content;

    // Verify IDMG with CA
    let idmgVerif = await certificates.getIdmg(ca);
    if(idmgVerif !== idmg) throw new Error("Mismatch IDMG/CA certificate");
    
    console.info("IDMG: ", idmg);

    // Verify the signature.
    let store = new certificates.CertificateStore(ca);
    if(! await store.verifyMessage(fiche)) throw new Error('While loading fiche.json: signature was rejected.');  // Throws Error if invalid

    // Return the content
    return {idmg, ca, chiffrage};
}

export async function connect() {
    await workers?.connection.connect();
}
