import './externalLibs/xmlsec-webcrypto.uncompressed';
import CryptoHelper from './HelperClass';

var xmlParser = new window.DOMParser();
var xmlSerializer = new XMLSerializer();
var xmlDocType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
var xmlDoc = document.implementation.createDocument("", "", xmlDocType);

export default class XmlBlock {
    constructor(xmlBlock, documentKey) {
        this.documentKey = documentKey;
        this.inputData = xmlBlock;
        this.xmlElement = null;
    }

    init() {
        return new Promise(
            function (resolve, reject) {
                if (this.inputData) {
                    if (typeof this.inputData === 'string' || this.inputData instanceof String)
                        if (this.isEncrypted) {
                            this.xmlElement = xmlParser.parseFromString(this.inputData, 'application/xml').childNodes[0];
                            return this._decryptElement().then(() => {
                                resolve();
                            }).catch((err) => {
                                reject(err);
                            });
                        } else {
                            this.xmlElement = xmlParser.parseFromString(this.inputData, 'application/xml').childNodes[0];
                        }
                    else {
                        if (this.isEncrypted) {
                            this.xmlElement = this.inputData;
                            return this._decryptElement().then(() => {
                                resolve();
                            }).catch((err) => {
                                reject(err);
                            });
                        } else {
                            this.xmlElement = this.inputData;
                        }
                    }
                } else {
                    this.xmlElement = this._createEmptyBlockElement();
                }
                resolve();
            }.bind(this)
        )
    }

    _decryptElement() {
        let blockElement = CryptoHelper.getBlockForDecryption(this.xmlElement);

        //decrypt the element
        let encryptedXML = new EncryptedXML();
        return encryptedXML.decrypt(blockElement, this.documentKey).then(function (decrypted) {
            //get the block element and replace it
            let newChild = decrypted.childNodes[0].childNodes[0].childNodes[0];
            this._decodeAllElementsForDecryption(newChild);
            //on refresh we want to replace the encrypted blocks
            if (this.xmlElement.parentElement != null)
                this.xmlElement.parentElement.replaceChild(newChild, this.xmlElement);
            this.xmlElement = newChild;
            console.log(newChild)
        }.bind(this));
    }

    _encryptElement() {
        let blockElement = CryptoHelper.getBlockForDecryption(this.xmlElement);
        this._encodeAllElementsForEncryption(blockElement.childNodes[0].childNodes[0]);
        let reference = new Reference("/block/block");
        let references = [];
        references.push(reference);

        let encryptedXML = new EncryptedXML();
        let encParams = new EncryptionParams();
        encParams.setSymmetricKey(this.documentKey);
        encParams.setStaticIV(false);
        encParams.setReferences(references);
        return encryptedXML.encrypt(blockElement, encParams.getEncryptionInfo()).then((encrypted) => {
            return encrypted.childNodes[0];
        });
    }

    _encodeAllElementsForEncryption(block){
        for(let i = 0; i < block.childNodes.length; i++){
            block.childNodes[i].textContent = encodeURI(block.childNodes[i].textContent);
        }
    }

    _decodeAllElementsForDecryption(block){
        for(let i = 0; i < block.childNodes.length; i++){
            block.childNodes[i].textContent = decodeURI(block.childNodes[i].textContent);
        }
    }

    get isEncrypted() {
        if (this.documentKey !== null)
            return true;
        return false;
    }

    get length() {
        return this.text.length;
    }

    get text() {
        return this.xmlElement.getElementsByTagName('data').item(0).textContent;
    }

    set text(data) {
        this.xmlElement.getElementsByTagName('data').item(0).textContent = data;
    }

    get element() {
        return this.xmlElement;
    }

    setAttributes(input) {
        if (input === null || Object.keys(input).length == 0) return;
        let attributeElement = this.xmlElement.getElementsByTagName('attributes').item(0);
        if (!attributeElement) {
            attributeElement = xmlDoc.createElement('attributes');
            this.xmlElement.appendChild(attributeElement);
        }
        let attributesValue = this.xmlElement.getElementsByTagName('attributes').item(0).textContent;
        let attributes = null;
        if (attributesValue != "")
            attributes = JSON.parse(attributesValue);
        else
            attributes = {};

        for (let key in input) {
            if (attributes[key]) {
                if (input[key] == null) {
                    delete attributes[key]
                } else {
                    attributes[key] = input[key];
                }
            } else {
                if (input[key] != null) {
                    attributes[key] = input[key];
                }
            }
        }

        if (Object.keys(attributes).length != 0) {
            attributeElement.textContent = JSON.stringify(attributes);
        } else {
            attributeElement.parentNode.removeChild(attributeElement);
        }
    }

    getAttributes() {
        let attributesElement = this.xmlElement.getElementsByTagName('attributes').item(0);
        if (attributesElement)
            return JSON.parse(attributesElement.textContent);
        else
            return null;
    }

    compareAttributes(attributeList) {
        let attributes = this.getAttributes();
        if (Object.keys(attributeList).length === 0 && attributes === null)
            return true;
        if ((Object.keys(attributeList).length > 0 && attributes === null)
            || Object.keys(attributeList).length != Object.keys(attributes).length)
            return false;

        for (let key in attributeList) {
            if (!attributes[key]) {
                return false;
            } else {
                if (attributes[key] != attributeList[key])
                    return false;
            }
        }
        return true;
    }

    clone() {
        let resultDataBlock = new XmlBlock(null, this.documentKey);
        resultDataBlock.init();
        resultDataBlock.text = this.text;
        resultDataBlock.setAttributes(this.getAttributes());
        return resultDataBlock;
    }

    toString() {
        if (this.isEncrypted)
            return this._encryptElement().then((encrypted) => {
                return xmlSerializer.serializeToString(encrypted);
            });
        else
            return new Promise((resolve) => {
                resolve(xmlSerializer.serializeToString(this.xmlElement));
            });
    }

    _createEmptyBlockElement() {
        var blockElement = xmlDoc.createElement('block');
        var dataElement = xmlDoc.createElement('data');
        //var opElement = xmlDoc.createElement('op');
        //var attributeElement =  xmlDoc.createElement('attributes');
        blockElement.appendChild(dataElement);
        //blockElement.appendChild(attributeElement);
        return blockElement;
    }

    setDocumentKey(value){
        this.documentKey = value;
    }

    deleteDocumentKey(){
        this.documentKey = null;
    }

}