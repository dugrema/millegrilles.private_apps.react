import {certificates} from "millegrilles.cryptography";
import { proxy, Remote, wrap } from 'comlink';

import { ConnectionCallbackParameters } from 'millegrilles.reactdeps.typescript';

import { AppsConnectionWorker } from "./connection.worker";
import { AppsEncryptionWorker } from './encryption';
import { DirectoryWorker } from './directory.worker';
import { AppsDownloadWorker, DownloadStateCallback } from './download.worker';
import { AppsUploadWorker, UploadStateCallback } from "./upload.worker";
import { SharedTransferHandler } from "./sharedTransfer.worker";

export type AppWorkers = {
    connection: Remote<AppsConnectionWorker>,
    encryption: Remote<AppsEncryptionWorker>,
    directory: Remote<DirectoryWorker>,
    download: Remote<AppsDownloadWorker>,
    upload: Remote<AppsUploadWorker>,
    sharedTransfer: Remote<SharedTransferHandler> | null,
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

export async function initWorkers(
    callback: (params: ConnectionCallbackParameters) => void,
    downloadStateCallback: DownloadStateCallback,
    uploadStateCallback: UploadStateCallback,
): Promise<InitWorkersResult> {

    let {idmg, ca, chiffrage} = await loadFiche();

    let connectionWorker = new Worker(new URL('./connection.worker.ts', import.meta.url));
    let connection = wrap(connectionWorker) as Remote<AppsConnectionWorker>;

    let encryptionWorker = new Worker(new URL('./encryption.worker.ts', import.meta.url));
    let encryption = wrap(encryptionWorker) as Remote<AppsEncryptionWorker>;

    let directoryWorker = new Worker(new URL('./directory.worker.ts', import.meta.url));
    let directory = wrap(directoryWorker) as Remote<DirectoryWorker>;

    let downloadWorker = new Worker(new URL('./download.dedicated.ts', import.meta.url));
    let download = wrap(downloadWorker) as Remote<AppsDownloadWorker>;

    let uploadWorker = new Worker(new URL('./upload.dedicated.ts', import.meta.url));
    let upload = wrap(uploadWorker) as Remote<AppsUploadWorker>;

    // Optional - a Shared Transfer worker, distributes updates across browser tabs.
    let sharedTransferHandler = null as Remote<SharedTransferHandler> | null;
    if(!!window.SharedWorker) {
        let sharedTransferWorker = new SharedWorker(new URL('./sharedTransfer.shared.ts', import.meta.url));
        sharedTransferHandler = wrap(sharedTransferWorker.port, sharedTransferWorker) as Remote<SharedTransferHandler>;
    }

    // Set-up the workers
    let serverUrl = new URL(window.location.href);
    serverUrl.pathname = SOCKETIO_PATH;
    await connection.initialize(serverUrl.href, ca, callback, {reconnectionDelay: 7500});
    await encryption.initialize(ca);
    await encryption.setEncryptionKeys(chiffrage);

    if(sharedTransferHandler) {
        // Wire transfer callbacks through the shared transfer handler.
        await sharedTransferHandler.addCallbacks(uploadStateCallback, downloadStateCallback);
        await download.setup(proxy((state)=>{
            if(!sharedTransferHandler) throw new Error('sharedTransferHandler null');
            return sharedTransferHandler.downloadStateCallback(state);
        }), true);
        await upload.setup(proxy((state)=>{
            if(!sharedTransferHandler) throw new Error('sharedTransferHandler null');
            return sharedTransferHandler.uploadStateCallback(state);
        }), ca, true);
    } else {
        await download.setup(downloadStateCallback, false);
        await upload.setup(uploadStateCallback, ca, false);
    }
    await upload.setEncryptionKeys(chiffrage);

    workers = {connection, encryption, directory, download, upload, sharedTransfer: sharedTransferHandler};

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
