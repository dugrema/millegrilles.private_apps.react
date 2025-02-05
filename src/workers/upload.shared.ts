import { expose } from 'comlink';
import {AppsUploadWorker} from './upload.worker';

var worker = new AppsUploadWorker();
// Expose as a shared worker
// @ts-ignore
onconnect = (e) => expose(worker, e.ports[0]);
