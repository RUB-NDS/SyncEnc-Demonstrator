import StaticKeyData from './staticKeyData'


export default class KeyHandler {
    /**
     * Creates a new KeyHandler. If useStaticKey is set, a static key pair will be used instead of the key server.
     * Warning using the static key option is not secure and should only be used for testing and demonstrations.
     * @param useStaticKeys uses a static key pair
     */
    constructor(useStaticKeys) {
        this.useStaticKeys = useStaticKeys;
        this._privateKey = null;
        this._publicKey = null;
        this.iframe = document.getElementById("postMessageIframe");
        window.addEventListener('message', this._resultMessage.bind(this), false);
        this.privateKeyPromiseSolved = null;
        this.publicKeyPromiseSolved = null;
        this.isIframeLoaded = false;
        this.isPrivateKeyRequired = false;
        this.isPrivateKeyRequested = false;
        this.iframe.addEventListener('load', () => {
            if (this.isIframeLoaded === false && this.isPrivateKeyRequired) {
                this._sendPrivateKeyRequestToKeyserver();
            }
            this.isIframeLoaded = true;
        });
    }

    /**
     * Sends a request to the key server for receiving the private key.
     * @private
     */
    _sendPrivateKeyRequestToKeyserver() {
        if (this.isPrivateKeyRequested === false) {
            const message = {
                'task': 'getPrivKey',
                'username': 'quill',
                'password': 'quill',
            };
            this.iframe.contentWindow.postMessage(message, 'https://neon.cloud.nds.rub.de/integrated');
            this.isPrivateKeyRequested = true;
        } else {
            console.info("Private key is already requested!");
        }
    }

    /**
     * returns a Promise for loading the private key. If the private key is already available, it will be returned
     * immediately. With the option {@code forceRelaodKey} the key will be requested from the key server again and the
     * current stored key will be replaced. The request will be terminated after 50000 ms.
     * @param forceReloadKey forces to reload the key from the keyserver
     * @returns {*}
     */
    loadPrivateKey(forceReloadKey) {
        if (this.useStaticKeys) {
            let privateKey = window.Helper.base64ToArrayBuffer(StaticKeyData.privateKeyString);
            return window.crypto.subtle.importKey("pkcs8", privateKey, {
                name: "RSA-OAEP",
                hash: {
                    name: "SHA-256"
                }
            }, true, ["decrypt", "unwrapKey"]).then((priKey) => {
                this._privateKey = priKey;
                return priKey;
            });
        }
        if (this._privateKey === null || forceReloadKey === true) {
            this.isPrivateKeyRequired = true;
            if (this.isIframeLoaded) {
                this._sendPrivateKeyRequestToKeyserver()
            }
            return new Promise((resolve, reject) => {
                this.privateKeyPromiseSolved = resolve;
                //set an Timeout for the request. User has to enter the pin number of his smart card.
                setTimeout(() => {
                    reject("Getting the private key from the keyserver timed out after " + 50000 + ' ms!');
                    this.privateKeyPromiseSolved = null;
                    this.isPrivateKeyRequested = false;
                }, 50000);
            });
        } else {
            return new Promise((resolve) => {
                resolve(this._privateKey);
            });
        }
    }

    /**
     * returns a Promise for loading the public key. If the public key is already available, it will be returned
     * immediately. With the option {@code forceRelaodKey} the key will be requested from the key server again and the
     * current stored key will be replaced.
     * @param forceReloadKey forces to reload the key from the keyserver
     * @returns {*}
     */
    loadPublicKey(forceReloadKey) {
        if (this.useStaticKeys) {
            let publicKey = window.Helper.base64ToArrayBuffer(StaticKeyData.publicKeyString);
            return window.crypto.subtle.importKey("spki", publicKey, {
                name: "RSA-OAEP",
                hash: {
                    name: "SHA-256"
                }
            }, true, ["encrypt", "wrapKey"])
                .then((pubKey) => {
                    this._publicKey = pubKey;
                    return pubKey;
                });
        }
        if (this._publicKey === null || forceReloadKey === true) {
            const msg = {
                'task': 'getPubKey',
                'username': 'quill'
            };
            this.iframe.contentWindow.postMessage(msg, 'https://neon.cloud.nds.rub.de/integrated');
            return new Promise((resolve, reject) => {
                this.publicKeyPromiseSolved = resolve;
                setTimeout(() => {
                    reject("Getting the public key from keyserver timed out after 50000 ms!");
                    this.publicKeyPromiseSolved = null;
                }, 50000);
            });
        }
    }

    /**
     * Receiver for messages from the keyserver. After receiving a key, the corresponding Promise will be resolved.
     * @private
     */
    _resultMessage() {
        console.log("received msg: " + event.data);
        if (event.data.data === 'privKey') {
            crypto.subtle.exportKey("pkcs8", event.data.key).then((key) => {
                crypto.subtle.importKey("pkcs8", key, {
                        name: "RSA-OAEP",
                        hash: {
                            name: "SHA-256"
                        }
                    }, false, ["decrypt", "unwrapKey"]
                ).then((privKey) => {
                    this.isPrivateKeyRequested = false;
                    this._privateKey = privKey;
                    this.privateKeyPromiseSolved(privKey);
                });
            });
        }
        //reimport key for the support of key wrapping
        if (event.data.data === 'pubKey') {
            crypto.subtle.exportKey("spki", event.data.key).then((key) => {
                crypto.subtle.importKey("spki", key, {
                        name: "RSA-OAEP",
                        hash: {
                            name: "SHA-256"
                        }
                    }, true, ["encrypt", "wrapKey"]
                ).then((pubKey) => {
                    this.publicKeyPromiseSolved(pubKey);
                });
            });
        }
    }
}