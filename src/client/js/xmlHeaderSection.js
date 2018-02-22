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
        this.user = 'admin';
        this.emitter = new EventEmitter();
    }

    get isEncrypted() {
        try {
            return (this.header.getElementsByTagName(this.elementNames.IS_ENCRYPTED).item(0).textContent === 'true');
        } catch (e) {
            return false;
        }
    }

    _setIsEncrypted(value) {
        if (this.isEncrypted === HelperClass.convertStringToBoolean(value))
            return;
        if (this.header.getElementsByTagName(this.elementNames.IS_ENCRYPTED).length === 0) {
            let isEncryptedElement = xmlDoc.createElement(this.elementNames.IS_ENCRYPTED);
            this.header.appendChild(isEncryptedElement);
        }
        this.header.getElementsByTagName(this.elementNames.IS_ENCRYPTED)[0].textContent = value;
        //encryption was enabled / disabled
        this.emitter.emit(XmlHeaderSection.events.ENCRYPTION_CHANGED, this.isEncrypted);
    }

    on() {
        return this.emitter.on.apply(this.emitter, arguments);
    }

    loadDocumentKey(privateKey) {
        let user = this._getUserByName(this.user);
        if (user === null) {
            throw new Error("User error");
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

    encryptDocumentKey(pubKey) {
        //TODO to the top
        return window.crypto.subtle.exportKey("raw", this.documentKey).then((key) => {
            let keyElement = this._generateKeyXML();
            let keyBase64 = window.Helper.arrayBufferToBase64(key);
            keyElement.childNodes[0].textContent = keyBase64;
            return this._encryptDocumentKey(keyElement, pubKey);
        });
    }

    addUser(name, keyElement) {
        let documentUsersElement = this.header.getElementsByTagName('documentUsers');
        if (documentUsersElement.length === 0) {
            documentUsersElement = xmlDoc.createElement('documentUsers');
            this.header.appendChild(documentUsersElement);
            documentUsersElement = this.header.getElementsByTagName('documentUsers');
        }
        if (documentUsersElement.length > 1) {
            throw new Error("document contains more than one User section!");
        }
        else {
            let user = this._getUserByName(this.user);
            documentUsersElement = documentUsersElement[0];
            if (user === null) {
                let userElement = xmlDoc.createElement('user');
                let nameElement = xmlDoc.createElement("name");
                nameElement.textContent = name;
                userElement.appendChild(nameElement);
                userElement.appendChild(keyElement.childNodes[0]);
                documentUsersElement.appendChild(userElement);
            } else {
                user.replaceChild(keyElement.childNodes[0], user.getElementsByTagName("key")[0]);
            }
        }
        this._setIsEncrypted('true');
        let remoteChanges = [];
        remoteChanges.push({
            op: xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT,
            data: xmlSerializer.serializeToString(documentUsersElement)
        });

        remoteChanges.push({
            op: xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT,
            data: xmlSerializer.serializeToString(this.header.getElementsByTagName(this.elementNames.IS_ENCRYPTED)[0])
        });
        return remoteChanges;
    }

    setHeaderElement(remoteOperations) {
        for (let i = 0; i < remoteOperations.length; i++) {
            let remoteDataElement = xmlParser.parseFromString(remoteOperations[i].data, "application/xml");
            if (remoteOperations[i].op === xmlEnc.operations.ADD_OR_REPLACE_HEADER_ELEMENT) {
                let headerElement = this.header.getElementsByTagName(remoteDataElement.childNodes[0].nodeName);
                if (remoteDataElement.childNodes[0].nodeName === this.elementNames.IS_ENCRYPTED) {
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

    createDocumentKey() {
        return window.crypto.subtle.generateKey({
            name: "AES-GCM",
            length: 256
        }, true, ["encrypt", "decrypt"]).then((key) => {
            this.documentKey = key;
            return key;
        });
    }

    _getUserByName(name) {
        let user = xpath.select("//header/documentUsers/user[name='" + name + "']", this.header);
        if (user.length !== 1)
            return null;
        return user[0];
    }

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
            console.log(xmlSerializer.serializeToString(keyElement));
            return encryptedXML.encrypt(keyElement, encParams.getEncryptionInfo()).then((result) => {
                return result;
            });
        });
    }

    _generateKeyXML() {
        var keyBlockElement = xmlDoc.createElement("key");
        var innerKeyElement = xmlDoc.createElement("docKey");
        keyBlockElement.appendChild(innerKeyElement);
        return keyBlockElement;
    }

    get elementNames() {
        return {
            DOCUMENT_USERS: 'documentUsers',
            IS_ENCRYPTED: 'isEncrypted',
            DOCUMENT_USERS_USER: 'user',
            DOCUMENT_USERS_USER_NAME: 'name',
            DOCUMENT_USERS_USER_KEY: 'key'
        }
    }
}

XmlHeaderSection.events = {
    ENCRYPTION_CHANGED: 'encryption-changed'
};

export default XmlHeaderSection;