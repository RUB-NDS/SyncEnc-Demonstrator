import StaticKeyData from './staticKeyData'
import UserLoginDialog from "./controls/userLoginDialog";


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
        this.privateKeyPromiseRejected = null;
        this.publicKeyPromiseSolved = null;
        this.publicKeyPromiseRejected = null;
        this.isIframeLoaded = false;
        this.isPrivateKeyRequired = false;
        this.isPrivateKeyRequested = false;
        this.userListPromiseResolved = null;
        this.userListPromiseRejected = null;
        this.isMultipleUsersRequested = false;
        this.userList = [];
        this.userListPos = 0;
        this.userListPublicKeys = [];
        this.loginDialog = null;
        this.user = null;
        if (!useStaticKeys) {
            this.loginDialog = new UserLoginDialog();
            this.loginDialog.addDialogToDocument(this._loginUser.bind(this));
        }
        this.iframe.addEventListener('load', () => {
            if (this.isIframeLoaded === false && this.isPrivateKeyRequired) {
                this.loginDialog.showModal(UserLoginDialog.REQUEST.PRIVATE_KEY);
            }
            this.isIframeLoaded = true;
        });
        this.otExtenderModule = window.quill.getModule("OtExtender");
    }

    /**
     * Handles the login dialog
     * @param dialog dialog object
     * @private
     */
    _loginUser(dialog) {
        if (dialog.action === UserLoginDialog.ACTION.CLOSED) {
            dialog.close();
            this.otExtenderModule.setStatusBarMessage("Login failed. Please reload the page!", "#E13737");
        } else if (dialog.action === UserLoginDialog.ACTION.SAVED) {
            this.user = dialog.username;
            this.password = dialog.password;
            if (dialog.request === UserLoginDialog.REQUEST.PRIVATE_KEY)
                this._sendPrivateKeyRequestToKeyserver();
            else if (dialog.request === UserLoginDialog.REQUEST.PUBLIC_KEY)
                this._sendPublicKeyRequestToKeyserver(this.user);
            dialog.close();
        }
    }

    /**
     * Sends a public key request for the corresponding user to the kms backend
     * @param user name for the requested public key
     * @private
     */
    _sendPublicKeyRequestToKeyserver(user) {
        const msg = {
            'task': 'getPubKey',
            'username': user
        };
        this.iframe.contentWindow.postMessage(msg, 'https://neon.cloud.nds.rub.de/integrated');
    }

    /**
     * Sends a request to the key server for receiving the private key.
     * @private
     */
    _sendPrivateKeyRequestToKeyserver() {
        if (this.isPrivateKeyRequested === false) {
            const message = {
                'task': 'getPrivKey',
                'username': this.user,
                'password': this.password
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
                if (this.user === null) {
                    this.loginDialog.showModal(UserLoginDialog.REQUEST.PRIVATE_KEY);
                } else {
                    this._sendPrivateKeyRequestToKeyserver();
                }
            }

            return new Promise((resolve, reject) => {
                this.privateKeyPromiseSolved = resolve;
                this.privateKeyPromiseRejected = reject;
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
            if (this.user === null) {
                this.loginDialog.showModal(UserLoginDialog.REQUEST.PUBLIC_KEY);
            } else {
                this._sendPublicKeyRequestToKeyserver(this.user);
            }

            return new Promise((resolve, reject) => {
                this.publicKeyPromiseSolved = resolve;
                this.publicKeyPromiseRejected = reject;
                setTimeout(() => {
                    reject("Getting the public key from keyserver timed out after 50000 ms!");
                    this.publicKeyPromiseSolved = null;
                }, 50000);
            });
        } else {
            return new Promise((resolve) => {
                resolve(this._publicKey);
            });
        }
    }

    /**
     * Receiver for messages from the keyserver. After receiving a key, the corresponding Promise will be resolved.
     * @private
     */
    _resultMessage() {
        console.log("received msg: " + event.data);
        //handle private key data
        if (event.data.data === 'privKey') {
            this.isPrivateKeyRequested = false;
            this._privateKey = event.data.key;
            this.privateKeyPromiseSolved(event.data.key);
        }

        //handle public key data
        if (event.data.data === 'pubKey') {
            /*if multiple users are requested, they must be handled sequentially. The keyserver does not return
            any user information, so it is impossible to figure out which key belongs to which user */
            if (this.isMultipleUsersRequested) {
                this.userListPublicKeys[this.userListPos] = {
                    user: this.userList[this.userListPos],
                    publicKey: event.data.key
                };
                this.userListPos++;
                if (this.userList[this.userListPos] !== undefined && this.userList[this.userListPos] !== null) {
                    this._sendPublicKeyRequestToKeyserver(this.userList[this.userListPos]);
                } else {
                    this.isMultipleUsersRequested = false;
                    this.userListPromiseResolved(this.userListPublicKeys);
                }
            } else {
                //if only the current user requests his own public key (used for first time encryption)
                this._publicKey = event.data.key;
                this.publicKeyPromiseSolved(event.data.key);
            }
        }

        //handle error from keyserver
        if (event.data.data === 'error') {


            this.otExtenderModule.setStatusBarMessage("Error: " + event.data.info +
                " Please reload the page and try it again.", "#E13737");
            if (this.privateKeyPromiseRejected != null) {
                this.privateKeyPromiseRejected();
                this.privateKeyPromiseSolved = null;
                this.privateKeyPromiseRejected = null;
            }

            if (this.publicKeyPromiseRejected !== null) {
                this.publicKeyPromiseRejected();
                this.publicKeyPromiseSolved = null;
                this.publicKeyPromiseRejected = null;
            }

            if (this.userListPromiseRejected != null) {
                this.userListPromiseRejected();
                this.userListPromiseRejected = null;
                this.userListPromiseResolved = null;
            }
        }
    }

    /**
     * Requests multiple public key requests from the kms backend
     * @param users list of user names
     * @returns {Promise<any>} returns a promise which will be solved after all public keys haven been received or the
     * promise will be rejected
     */
    getPublicKeysByUsers(users) {
        this.isMultipleUsersRequested = true;
        this.userListPublicKeys = [];
        this.userList = users;
        this.userListPos = 0;
        this._sendPublicKeyRequestToKeyserver(this.userList[this.userListPos]);
        return new Promise((resolve, reject) => {
            this.userListPromiseResolved = resolve;
            this.userListPromiseRejected = reject;
        });
    }
}
