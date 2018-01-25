const xmlParser = new window.DOMParser();
const xmlSerializer = new XMLSerializer();
const xmlDocType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
const xmlDoc = document.implementation.createDocument("", "", xmlDocType);

export default class HelperClass{

    /**
     * creates a new outer block element and clones the xmlElement for decryption.
     * @param xmlElement element that shall be decrypted
     * @returns {Document} a new cloned xml element
     */
    static getBlockForDecryption(xmlElement){
        let clonedElement = xmlElement.cloneNode(true);
        let encryptedElement = xmlDoc.createElement('block');
        encryptedElement.appendChild(clonedElement);
        return xmlParser.parseFromString(xmlSerializer.serializeToString(encryptedElement), "application/xml");
    }

    /**
     * converts a string boolean string to an boolean value
     * @param value boolean string
     * @returns {boolean} the value as boolean
     */
    static convertStringToBoolean(value){
        if(value === 'true')
            return true;
        return false;
    }
}