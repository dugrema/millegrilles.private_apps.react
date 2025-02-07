import { keymaster } from "millegrilles.cryptography";

/** DEBUG - Used for throttling the workers */
export const THROTTLE_UPLOAD = 0;

export type EncryptionResult = {
    format: string, 
    nonce: Uint8Array, 
    ciphertext: Uint8Array, 
    digest?: Uint8Array,
    cle?: {signature: keymaster.DomainSignature}
    cle_id?: string,
    cleSecrete?: Uint8Array,
    compression?: string,
};

export type EncryptionBase64Result = {
    format: string, 
    nonce: string, 
    ciphertext_base64: string, 
    digest?: string,
    cle?: {signature: keymaster.DomainSignature}
    cle_id?: string,
    cleSecrete?: Uint8Array,
    compression?: string,
};

export async function generateKeyFromCipher(cipher: any, domains: string[]): Promise<void> {
    // let keySignature = new keymaster.DomainSignature(domains, 1, secret.peer);
    // await keySignature.sign(cipher.key);

    // let cles = await this.encryptSecretKey(secret.secret)
    // // let cles = {} as {[key: string]: string};
    // // for await(let encryptionKey of this.encryptionKeys) {
    // //     let fingerprint = encryptionKey.getPublicKey();
    // //     let pkBytes = multiencoding.decodeHex(fingerprint);
    // //     let newEncryptedKey = await x25519.encryptEd25519(secret.secret, pkBytes);
    // //     cles[fingerprint] = newEncryptedKey;
    // // }

    // let keyId = await keySignature.getKeyId();
    // let key = secret.secret;
    // let newKey = {
    //     signature: keySignature,
    //     cles,
    // };

    // let info: EncryptionResult = {format: 'mgs4', nonce: cipher.header, digest: cipher.digest} as EncryptionResult;
    // if(compression) info.compression = compression;
    // if(newKey && keyId) {
    //     info.cle_id = keyId;
    //     info.cle = newKey;
    //     info.cleSecrete = key;
    // }
}
