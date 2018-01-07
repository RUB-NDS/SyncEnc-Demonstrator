var xmlParser = new window.DOMParser();
var xmlSerializer = new XMLSerializer();
var xmlDoc = document.implementation.createDocument("","",null);

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

    setAttributes(input){
        if (input === null || Object.keys(input).length == 0) return;
        let attributeElement = this.xmlElement.getElementsByTagName('attributes').item(0);
        if(!attributeElement){
            attributeElement =  xmlDoc.createElement('attributes');
            this.xmlElement.appendChild(attributeElement);
        }
        let attributesValue = this.xmlElement.getElementsByTagName('attributes').item(0).textContent;
        let attributes = null;
        if(attributesValue != "")
            attributes = JSON.parse(attributesValue);
        else
            attributes = {};

        for(let key in input){
            if(attributes[key]){
                if(input[key] == null) {
                    delete attributes[key]
                }else{
                    attributes[key] = input[key];
                }
            }else{
                if(input[key] != null){
                    attributes[key] = input[key];
                }
            }
        }

        if(Object.keys(attributes).length != 0){
            attributeElement.textContent = JSON.stringify(attributes);
        }else{
            attributeElement.parentNode.removeChild(attributeElement);
        }
    }

    getAttributes(){
        let attributesElement = this.xmlElement.getElementsByTagName('attributes').item(0);
        if(attributesElement)
            return JSON.parse(attributesElement.textContent);
        else
            return null;
    }

    compareAttributes(attributeList){
        let attributes = this.getAttributes();
        if(Object.keys(attributeList).length === 0 && attributes === null)
            return true;
        if((Object.keys(attributeList).length > 0 && attributes === null)
            || Object.keys(attributeList).length != Object.keys(attributes).length)
            return false;

        for(let key in attributeList){
            if(!attributes[key]) {
                return false;
            } else {
                if(attributes[key] != attributeList[key])
                    return false;
            }
        }
        return true;
    }

    clone(){
        let resultDataBlock = new XmlBlock();
        resultDataBlock.text = this.text;
        resultDataBlock.setAttributes(this.getAttributes());
        return resultDataBlock;
    }

    toString(){
        return xmlSerializer.serializeToString(this.xmlElement);
    }

    _createEmptyBlockElement(){
        var blockElement = xmlDoc.createElement('block');
        var dataElement = xmlDoc.createElement('data');
        //var opElement = xmlDoc.createElement('op');
        //var attributeElement =  xmlDoc.createElement('attributes');
        blockElement.appendChild(dataElement);
        //blockElement.appendChild(attributeElement);
        return blockElement;
    }

}