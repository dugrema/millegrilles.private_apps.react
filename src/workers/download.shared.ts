import { expose } from 'comlink';
import {AppsDownloadWorker} from './download.worker';

var worker = new AppsDownloadWorker();
// Expose as a shared worker
// @ts-ignore
onconnect = (e) => expose(worker, e.ports[0]);
