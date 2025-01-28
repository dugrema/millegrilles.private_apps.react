import { expose } from 'comlink';

export class DownloadDecryptionWorker {

    async hello() {
        return 'hello';
    }

}

var worker = new DownloadDecryptionWorker();
expose(worker);
