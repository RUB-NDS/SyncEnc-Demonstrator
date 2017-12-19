import XmlDataBlock from 'xmlDataBlock';
import xmlEnc from 'xml-enc/lib/type';

export default class xmlDataCollection{
    constructor(documentElement){
        this.document = documentElement;
        this.dataBlockList = [];
        for(let i = 0; i < documentElement.childNodes.length; i++){
            this.dataBlockList.append(new XmlDataBlock(documentElement.childNodes.item(i)));
        }
    }

    insertAtIndex(xmlDataBlock, pos){
        this.dataBlockList.splice(pos, 0, xmlDataBlock);
        xmlEnc.addBlock(this.document, pos, xmlDataBlock.toString());
    }

    deleteAtIndex(pos){
        this.dataBlockList.splice(pos, 1);
        xmlEnc.deleteBlock(this.document, pos);
    }

    replaceAtIndex(xmlDataBlock, pos){
        this.deleteAtIndex(pos);
        this.insertAtIndex(xmlDataBlock, pos);
    }

    getXmlDataBlock(pos){
        return this.dataBlockList[pos];
    }
}
