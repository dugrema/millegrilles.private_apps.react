import { expose } from 'comlink';

export class DownloadDecryptionWorker {

    async hello() {
        return 'hello';
    }

    async cancelJobIf(fuuid: string, userId: string) {
        console.warn("TODO");
    }

}

var worker = new DownloadDecryptionWorker();
expose(worker);
