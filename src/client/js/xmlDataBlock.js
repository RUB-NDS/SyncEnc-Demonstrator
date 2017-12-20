import XmlDom from 'xmldom';

var xmlParser = new XmlDom.DOMParser();
var xmlSerializer = new XmlDom.XMLSerializer();
var xmlDoc = new XmlDom.DOMImplementation().createDocument("","",null);

export default class XmlBlock{
    constructor(xmlBlock){
        if(xmlBlock)
            if(typeof xmlBlock === 'string' || xmlBlock instanceof String)
                this.xmlElement = xmlParser.parseFromString(xmlBlock, 'application/xml');
            else
                this.xmlElement = xmlBlock;
        else
            this.xmlElement = this._createEmptyBlockElement();
    }

    get length(){
        return this.text.length;
    }

    get text(){
        return this.xmlElement.getElementsByTagName('data').item(0).textContent;
    }

    set text(data){
        this.xmlElement.getElementsByTagName('data').item(0).textContent = data;
    }

    get element(){
        return this.xmlElement;
    }

    toString(){
        return xmlSerializer.serializeToString(this.xmlElement);
    }

    _createEmptyBlockElement(){
        var blockElement = xmlDoc.createElement('block');
        var dataElement = xmlDoc.createElement('data');
        //var opElement = xmlDoc.createElement('op');
        blockElement.appendChild(dataElement);
        return blockElement;
    }

}