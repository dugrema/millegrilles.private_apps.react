import { expose } from 'comlink';

export class DownloadThreadWorker {

    async hello() {
        return 'hello';
    }

}

var worker = new DownloadThreadWorker();
expose(worker);
