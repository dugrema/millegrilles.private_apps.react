import { expose } from 'comlink';
import {SharedTransferHandler} from './sharedTransfer.worker';

var worker = new SharedTransferHandler();
// Expose as a shared worker
// @ts-ignore
onconnect = (e) => expose(worker, e.ports[0]);
