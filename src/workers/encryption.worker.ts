import '@solana/webcrypto-ed25519-polyfill';
import { expose } from 'comlink';

import { encryption, encryptionMgs4, multiencoding } from 'millegrilles.cryptography';

export class AppsEncryptionWorker {

    async decryptMessage(format: string, key: string | Uint8Array, nonce: string | Uint8Array, ciphertext: string | Uint8Array) {
        if(format !== 'mgs4') throw new Error('Unsupported format');

        if(typeof(key) == 'string') {
            key = multiencoding.decodeBase64Nopad(key);
        }
        if(typeof(nonce) == 'string') {
            nonce = multiencoding.decodeBase64Nopad(nonce);
        }
        if(typeof(ciphertext) == 'string') {
            ciphertext = multiencoding.decodeBase64Nopad(ciphertext);
        }
        
        let decipher = await encryptionMgs4.getMgs4Decipher(key, nonce);
        let cleartext1 = await decipher.update(ciphertext);
        let cleartext2 = await decipher.finalize();
        let buffers = [];
        if(cleartext1) buffers.push(cleartext1);
        if(cleartext2) buffers.push(cleartext2);
        
        return encryption.concatBuffers(buffers);
    }

}

var worker = new AppsEncryptionWorker();
expose(worker);
