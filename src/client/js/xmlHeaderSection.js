import xpath from 'xpath';
import './externalLibs/xmlsec-webcrypto.uncompressed';
import xmlEnc from 'xml-enc/lib/type';
import HelperClass from './HelperClass';
import {EventEmitter} from 'eventemitter3';

var xmlParser = new window.DOMParser();
var xmlSerializer = new XMLSerializer();
var xmlDocType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
var xmlDoc = document.implementation.createDocument("", "", xmlDocType);


class XmlHeaderSection {
    constructor(header, user) {
        this.header = header;
        this.documentKey = null;
        this.user = user;
        this.emitter = new EventEmitter();
    }

    /**
     * @returns {boolean} true if the document is encrypted and a document key is required
     */
    get isEncrypted() {
        try {
            return (this.header.getElementsByTagName(XmlHeaderSection.elementNames.IS_ENCRYPTED).item(0).textContent === 'true');
        } catch (e) {
            return false;
        }
    }

    /**
     * Sets the isEncrypted parameter.
     * @param value true or false
     * @private
     */
    _setIsEncrypted(value) {
        if (this.isEncrypted === HelperClass.convertStringToBoolean(value))
            return;
        if (this.header.getElementsByTagName(XmlHeaderSection.elementNames.IS_ENCRYPTED).length === 0) {
            let isEncryptedElement = xmlDoc.createElement(XmlHeaderSection.elementNames.IS_ENCRYPTED);
            this.header.appendChild(isEncryptedElement);
        }
        this.header.getElementsByTagName(XmlHeaderSection.elementNames.IS_ENCRYPTED)[0].textContent = value;
        //encryption was enabled / disabled
        this.emitter.emit(XmlHeaderSection.events.ENCRYPTION_CHANGED, this.isEncrypted);
    }

    /**
     * used to listen to XmlHeaderSection.events
     * @returns {EventEmitter}
     */
    on() {
        return this.emitter.on.apply(this.emitter, arguments);
    }

    /**
     * Decrypts the document key from the header section. The document key is required to decrypt the document content.
     * If the corresponding user is not found, an error will be returned and the document cannot be encrypted.
     * @param privateKey private key for decrypting the document.
     */
    loadDocumentKey(privateKey) {
        let user = this._getUserByName(this.user);
        if (user === null) {
            window.quill.getModule("OtExtender").setStatusBarMessage(
                "The User '" + this.user + "' was not found. Please ask the document owner to add you.",
                "red"
            );
            window.quill.disable();
            throw new Error("The User '" + this.user + "' was not found. Please ask the document owner to add you.");
        }
        let block = HelperClass.getBlockForDecryption(user.getElementsByTagName('key')[0]);
        let encryptedXML = new EncryptedXML();
        return encryptedXML.decrypt(block, privateKey).then((decryptedKeyElement) => {
            console.log(decryptedKeyElement.childNodes[0].textContent);
            let keyArray = window.Helper.base64ToArrayBuffer(decryptedKeyElement.childNodes[0].textContent);
            return window.crypto.subtle.importKey("raw", keyArray, {
                name: "AES-GCM"
            }, true, ["encrypt", "decrypt"]).then((key) => {
                this.documentKey = key;
                return key;
            });
        });
    }

    /**
     * Encrypts the document key with the given public key. This is required if a new user has been added to the
     * document
     * @param pubKey public key of the corresponding user
     * @returns {PromiseLike<ArrayBuffer>} promise that returns the encrypted document key
     */
    encryptDocumentKey(pubKey) {
        return window.crypto.subtle.exportKey("raw", this.documentKey).then((key) => {
            let keyElement = XmlHeaderSection._generateKeyXML();
            let keyBase64 = window.Helper.arrayBufferToBase64(key);
            keyElement.childNodes[0].textContent = keyBase64;
            return this._encryptDocumentKey(keyElement, pubKey);
        });
    }

    /**
     * @returns {*|Element} the document user element within the header section or null
     * @private
     */
    get _documentUsersElement() {
        return this.header.getElementsByTagName(XmlHeaderSection.elementNames.DOCUMENT_USERS)[0];
    }

    /**
     * Adds a user to the header section
     * @param name of the user (username)
     * @param keyElement encrypted document key
     * @private
     */
    _addUser(name, keyElement) {
        let documentUsersElement = this.header.getElementsByTagName(XmlHeaderSection.elementNames.DOCUMENT_USERS);
        if (documentUsersElement.length === 0) {
            documentUsersElement = xmlDoc.createElement(XmlHeaderSection.elementNames.DOCUMENT_USERS);
            this.header.appendChild(documentUsersElement);
            documentUsersElement = this.header.getElementsByTagName(XmlHeaderSection.elementNames.DOCUMENT_USERS);
        }
        if (documentUsersElement.length > 1) {
            throw new Error("document contains more than one User section!");
        }
        else {
            let user = this._getUserByName(name);
            documentUsersElement = documentUsersElement[0];
            if (user === null) {
                let userElement = xmlDoc.createElement(XmlHeaderSection.elementNames.DOCUMENT_USERS_USER);
                let nameElement = xmlDoc.createElement(XmlHeaderSection.elementNames.DOCUMENT_USERS_USER_NAME);
                nameElement.textContent = name;
                userElement.appendChild(nameElement);
                userElement.appendChild(keyElement.childNodes[0]);
                documentUsersElement.appendChild(userElement);
            } else {
                user.replaceChild(keyElement.childNodes[0],
                    user.getElementsByTagName(XmlHeaderSection.elementNames.DOCUMENT_USERS_USER_KEY)[0]);
            }
        }
    }

    /**
     * Adds all users within the userObject array. The document key will be encrypted with every users public key within
     * the userObject. If the user already exists, the user will be replaced with the new data.
     * @param userObject Object containing a user (name) and the public key. ({user: name, publicKey: %PUBLIC_KEY%}
     * @param documentKey the current document key that shall be encrypted
     * @returns {Promise<[any , any , any , any , any , any , any , any , any , any]>} a promise will return the
     * remote changes for the server
     */
    addUsers(userObject, documentKey) {
        this.documentKey = documentKey;
        let addUserPromises = [];
        for (let i = 0; i < userObject.length; i++) {
            addUserPromises.push(
                this.encryptDocumentKey(userObject[i].publicKey).then((encryptedDocumentKeyElement) => {
                    this._addUser(userObject[i].user, encryptedDocumentKeyElement);
                })
            );
        }

        //Wait until all users are done and then return the remote change
        return Promise.all(addUserPromises).then(() => {
            this._setIsEncrypted('true');
            let remoteChanges = [];
            remoteChanges.push({
                op: xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT,
                data: xmlSerializer.serializeToString(this._documentUsersElement)
            });

            remoteChanges.push({
                op: xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT,
                data: xmlSerializer.serializeToString(this.header.getElementsByTagName(XmlHeaderSection.elementNames.IS_ENCRYPTED)[0])
            });
            return remoteChanges;
        });
    }

    /**
     * Removes a user from the document, but do not return any remote changes. The addUsers method should be called
     * afterwards with a new document key to ensure that all remaining users are getting the new document key.
     * @param user
     */
    removeUser(user) {
        let headerUser = this._getUserByName(user);
        if (headerUser !== null) {
            headerUser.parentElement.removeChild(headerUser);
        }
    }

    /**
     * Executes the remote changes and replaces the header section
     * @param remoteOperations remote operation to replace the header section
     */
    setHeaderElement(remoteOperations) {
        for (let i = 0; i < remoteOperations.length; i++) {
            let remoteDataElement = xmlParser.parseFromString(remoteOperations[i].data, "application/xml");
            if (remoteOperations[i].op === xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT) {
                let headerElement = this.header.getElementsByTagName(remoteDataElement.childNodes[0].nodeName);
                if (remoteDataElement.childNodes[0].nodeName === XmlHeaderSection.elementNames.IS_ENCRYPTED) {
                    this._setIsEncrypted(remoteDataElement.childNodes[0].textContent);
                } else {
                    if (headerElement.length === 0) {
                        this.header.appendChild(remoteDataElement.childNodes[0]);
                    } else {
                        this.header.replaceChild(remoteDataElement.childNodes[0], headerElement[0]);
                    }
                }
            }
        }
    }

    /**
     * Creates a new document key for the document
     * @returns {PromiseLike<CryptoKey>} promise that returns the new document key
     */
    createDocumentKey() {
        return window.crypto.subtle.generateKey({
            name: "AES-GCM",
            length: 256
        }, true, ["encrypt", "decrypt"]).then((key) => {
            this.documentKey = key;
            return key;
        });
    }

    /**
     * Returns all the current Users of the document
     * @returns {Array} with all usernames
     */
    getUserList() {
        let documentUsersElement = this.header.getElementsByTagName(XmlHeaderSection.elementNames.DOCUMENT_USERS);
        if (documentUsersElement.length === 0) {
            return [];
        } else {
            let users = xpath.select("//header/documentUsers/user/name", this.header);
            let result = [];
            for (let i = 0; i < users.length; i++) {
                result.push(users[i].textContent);
            }
            console.log(result);
            return result;
        }
    }

    /**
     * Searches a user by name and returns the user element
     * @param name of the user
     * @returns {*} the corresponding user element
     * @private
     */
    _getUserByName(name) {
        let user = xpath.select("//header/documentUsers/user[name='" + name + "']", this.header);
        if (user.length !== 1)
            return null;
        return user[0];
    }

    /**
     * Encrypts the document key with the given public key and returns a promise containing the encrypted element.
     * @param keyElement the user's key element
     * @param publicKey public key of the user
     * @returns {PromiseLike<CryptoKey>} promise that returns the encrypted key element
     * @private
     */
    _encryptDocumentKey(keyElement, publicKey) {
        return window.crypto.subtle.generateKey({
            name: "AES-GCM",
            length: 256
        }, true, ["encrypt", "decrypt"]).then((key) => {
            let tmp = xmlSerializer.serializeToString(keyElement);
            keyElement = xmlParser.parseFromString(tmp, "application/xml");
            let reference = new Reference("/key/docKey");
            let references = [];
            references.push(reference);
            let encryptedXML = new EncryptedXML();
            let encParams = new EncryptionParams();
            encParams.setPublicKey(publicKey, "rsaKey");
            encParams.setSymmetricKey(key);
            encParams.setStaticIV(false);
            encParams.setReferences(references);
            //console.log(xmlSerializer.serializeToString(keyElement));
            return encryptedXML.encrypt(keyElement, encParams.getEncryptionInfo()).then((result) => {
                return result;
            });
        });
    }

    /**
     * Fenerates a new user's key element
     * @returns {HTMLElement} a new key element
     * @private
     */
    static _generateKeyXML() {
        var keyBlockElement = xmlDoc.createElement(XmlHeaderSection.elementNames.DOCUMENT_USERS_USER_KEY);
        var innerKeyElement = xmlDoc.createElement("docKey");
        keyBlockElement.appendChild(innerKeyElement);
        return keyBlockElement;
    }

    /**
     * Element names of the header section.
     * @returns {{DOCUMENT_USERS: string, IS_ENCRYPTED: string, DOCUMENT_USERS_USER: string,
     * DOCUMENT_USERS_USER_NAME: string, DOCUMENT_USERS_USER_KEY: string}}
     */
    static get elementNames() {
        return {
            DOCUMENT_USERS: 'documentUsers',
            IS_ENCRYPTED: 'isEncrypted',
            DOCUMENT_USERS_USER: 'user',
            DOCUMENT_USERS_USER_NAME: 'name',
            DOCUMENT_USERS_USER_KEY: 'key'
        }
    }
}

/**
 * Events of the header section
 * @type {{ENCRYPTION_CHANGED: string}}
 */
XmlHeaderSection.events = {
    ENCRYPTION_CHANGED: 'encryption-changed'
};

export default XmlHeaderSection;
