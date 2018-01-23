const xmlParser = new window.DOMParser();
const xmlSerializer = new XMLSerializer();
const xmlDocType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
const xmlDoc = document.implementation.createDocument("", "", xmlDocType);

export default class HelperClass{

    static getBlockForDecryption(xmlElement){
        let clonedElement = xmlElement.cloneNode(true);
        let encryptedElement = xmlDoc.createElement('block');
        encryptedElement.appendChild(clonedElement);
        return xmlParser.parseFromString(xmlSerializer.serializeToString(encryptedElement), "application/xml");
    }

    static convertStringToBoolean(value){
        if(value === 'true')
            return true;
        return false;
    }
}