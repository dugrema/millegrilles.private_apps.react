import '@solana/webcrypto-ed25519-polyfill';

import { encryption, encryptionMgs4, multiencoding, keymaster, x25519, certificates } from 'millegrilles.cryptography';
import { gzip, inflate } from 'pako';
import { EncryptionBase64Result, EncryptionBase64WithEncryptedKeysResult, EncryptionResult } from './encryptionUtils';

export type EncryptionOptions = {
    base64?: boolean,
}

export type GeneratedSecretKeyResult = { keyInfo: any, secret: Uint8Array, signature: keymaster.DomainSignature, cle_id: string };

export class AppsEncryptionWorker {
    millegrillePublicKey: Uint8Array | null;
    caCertificate: certificates.CertificateWrapper | null;
    encryptionKeys: Array<certificates.CertificateWrapper>;

    constructor() {
        this.millegrillePublicKey = null;
        this.caCertificate = null;
        this.encryptionKeys = [];
    }

    async initialize(caPem: string) {
        let wrapper = new certificates.CertificateWrapper([caPem], caPem);
        if(await wrapper.verify()) {
            let publicKey = wrapper.getPublicKey();
            this.millegrillePublicKey = multiencoding.decodeHex(publicKey);
            this.caCertificate = wrapper;
        }
    }

    async getMillegrillePublicKey() {
        if(!this.millegrillePublicKey) throw new Error('Key not initialized');
        return this.millegrillePublicKey;
    }

    async generateSecretKey(domains: string[]): Promise<GeneratedSecretKeyResult> {
        if(!this.millegrillePublicKey) throw new Error('Key not initialized');
        let keyInfo = await x25519.secretFromEd25519(this.millegrillePublicKey);
        let keySignature = new keymaster.DomainSignature(domains, 1, keyInfo.peer);
        await keySignature.sign(keyInfo.secret);
        let keyId = await keySignature.getKeyId();
        return { keyInfo, secret: keyInfo.secret, signature: keySignature, cle_id: keyId };
    }

    

    /**
     * 
     * @param pems Arrays of pems, each pem being a certificat chain for a MaitreDesCles certificate.
     */
    async setEncryptionKeys(pems: Array<string[]>) {
        let validWrappers = [];
        for await(let wrapper of pems.map(item=>new certificates.CertificateWrapper(item))) {
            try{ 
                await wrapper.verify(this.caCertificate?.certificate); 
                validWrappers.push(wrapper);
            } catch(err) { 
                console.warn("invalid MaitreDesCles certificate, rejected"); 
            }
        }
        this.encryptionKeys = validWrappers;
    }

    async encryptMessageMgs4(cleartext: Object | string | Uint8Array, opts?: {key?: string | Uint8Array, domain?: string}): Promise<EncryptionResult> {
        let key = opts?.key;
        let domain = opts?.domain;

        if(typeof(key) === 'string') {
            key = multiencoding.decodeBase64Nopad(key);
        }

        let cleartextArray: Uint8Array;
        if(typeof(cleartext) === 'string') {
            cleartextArray = new TextEncoder().encode(cleartext);
        } else if(ArrayBuffer.isView(cleartext)) {
            // @ts-ignore
            cleartextArray = cleartext as Uint8Array;
        } else {
            cleartextArray = new TextEncoder().encode(JSON.stringify(cleartext));
        }

        let compression = null as null | string;
        if(cleartextArray.length > 200) {
            // Issue with deflate, incompatible with the rust version.
            //compression = 'deflate';
            //cleartextArray = deflate(cleartextArray);

            // Compress with gzip
            compression = 'gz';
            cleartextArray = gzip(cleartextArray);
        }

        let cipher = null;
        let newKey = null as any;
        let keyId = null as string | null;
        if(key) {
            // Reuse existing key
            cipher = await encryptionMgs4.getMgs4CipherWithSecret(key);
        } else if (domain) {
            // Ensure we have the information to generate a new encryption key.
            if(!this.millegrillePublicKey) throw new Error("MilleGrille CA key not initialized");
            if(this.encryptionKeys.length === 0) throw new Error("No system encryption keys are available");

            // Generate new key using the master key.
            let secret = await x25519.secretFromEd25519(this.millegrillePublicKey);
            cipher = await encryptionMgs4.getMgs4CipherWithSecret(secret.secret);
            
            let keySignature = new keymaster.DomainSignature([domain], 1, secret.peer);
            await keySignature.sign(cipher.key);

            let cles = await this.encryptSecretKey(secret.secret)
            // let cles = {} as {[key: string]: string};
            // for await(let encryptionKey of this.encryptionKeys) {
            //     let fingerprint = encryptionKey.getPublicKey();
            //     let pkBytes = multiencoding.decodeHex(fingerprint);
            //     let newEncryptedKey = await x25519.encryptEd25519(secret.secret, pkBytes);
            //     cles[fingerprint] = newEncryptedKey;
            // }

            keyId = await keySignature.getKeyId();
            key = secret.secret;
            newKey = {
                signature: keySignature,
                cles,
            };
        } else {
            throw new Error('Domain must be provided');
        }
        
        let out1 = await cipher.update(cleartextArray);
        let out2 = await cipher.finalize();

        let buffers = [];
        if(out1) buffers.push(out1);
        if(out2) buffers.push(out2);
        let ciphertext = encryption.concatBuffers(buffers);

        let info: EncryptionResult = {format: 'mgs4', nonce: cipher.header, ciphertext, digest: cipher.digest} as EncryptionResult;
        if(compression) info.compression = compression;
        if(newKey && keyId) {
            info.cle_id = keyId;
            info.cle = newKey;
            info.cleSecrete = key;
        }

        return info;
    }

    async encryptMessageMgs4ToBase64(cleartext: Object | string | Uint8Array, key?: string | Uint8Array): Promise<EncryptionBase64Result> {
        let info = await this.encryptMessageMgs4(cleartext, {key});

        let infoBase64: EncryptionBase64Result = {
            format: info.format, 
            nonce: multiencoding.encodeBase64(info.nonce), 
            ciphertext_base64: multiencoding.encodeBase64(info.ciphertext),
            digest: info.digest?(multiencoding.encodeBase64(info.digest)):undefined,
            cle: info.cle,
            cle_id: info.cle_id,
            cleSecrete: info.cleSecrete,
            compression: info.compression,
        };

        return infoBase64;
    }

    async encryptMessageMgs4ForDomain(cleartext: Object | string | Uint8Array, domain: string): Promise<EncryptionBase64WithEncryptedKeysResult>  {
        const info = await this.encryptMessageMgs4(cleartext, {domain});
        if(!info.cleSecrete || !info.cle) throw new Error("Secret key not provided");
        const keys = await this.encryptSecretKey(info.cleSecrete)
        const infoBase64: EncryptionBase64Result = {
            format: info.format, 
            nonce: multiencoding.encodeBase64(info.nonce), 
            ciphertext_base64: multiencoding.encodeBase64(info.ciphertext),
            digest: info.digest?(multiencoding.encodeBase64(info.digest)):undefined,
            key: {signature: info.cle.signature, keys},
            compression: info.compression,
        } as EncryptionBase64WithEncryptedKeysResult;
        return infoBase64;
    }

    /**
     * Encrytps a secret key for all currently loaded KeyMaster public keys.
     * @param secretKey Secret key to encrypt.
     * @returns Dict of encrypted keys.
     */
    async encryptSecretKey(secretKey: Uint8Array): Promise<{[key: string]: string}> {
        let cles = {} as {[key: string]: string};
        for await(let encryptionKey of this.encryptionKeys) {
            let fingerprint = encryptionKey.getPublicKey();
            let pkBytes = multiencoding.decodeHex(fingerprint);
            let newEncryptedKey = await x25519.encryptEd25519(secretKey, pkBytes);
            cles[fingerprint] = newEncryptedKey;
        }
        return cles;
    }

    async decryptMessage(format: string, key: string | Uint8Array, nonce: string | Uint8Array, ciphertext: string | Uint8Array, compression?: string | null) {
        if(format !== 'mgs4') throw new Error('Unsupported format');

        if(typeof(key) === 'string') {
            key = multiencoding.decodeBase64Nopad(key);
        }
        if(typeof(nonce) === 'string') {
            nonce = multiencoding.decodeBase64Nopad(nonce);
        }
        if(typeof(ciphertext) === 'string') {
            if(ciphertext.endsWith('=')) {
                ciphertext = multiencoding.decodeBase64(ciphertext);
            } else {
                ciphertext = multiencoding.decodeBase64Nopad(ciphertext);
            }
        }
        
        let decipher = await encryptionMgs4.getMgs4Decipher(key, nonce);
        let cleartext1 = await decipher.update(ciphertext);
        let cleartext2 = await decipher.finalize();
        let buffers = [];
        if(cleartext1) buffers.push(cleartext1);
        if(cleartext2) buffers.push(cleartext2);

        let completeBuffer = encryption.concatBuffers(buffers)

        if(compression === 'gz' || compression === 'deflate') {
            completeBuffer = inflate(completeBuffer);
        } else if(compression) {
            throw new Error('Unsupported compression format: ' + compression);
        }

        return completeBuffer;
    }

}
