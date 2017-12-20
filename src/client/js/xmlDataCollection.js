import XmlDataBlock from './xmlDataBlock';

export default class xmlDataCollection{
    constructor(documentElement){
        this.document = documentElement;
        this.dataBlockList = [];
        for(let i = 0; i < documentElement.childNodes.length; i++){
            this.dataBlockList.append(new XmlDataBlock(documentElement.childNodes.item(i)));
        }
    }

    insertAtIndex(xmlDataBlock, pos){
        let a = 'b';
        this.dataBlockList.splice(pos, 0, xmlDataBlock);
        if(pos == this.document.childNodes.length)
            this.document.appendChild(xmlDataBlock.element);
        else
            this.document.insertBefore(xmlDataBlock.element,
                this.document.childNodes[pos]);
    }

    deleteAtIndex(pos){
        this.dataBlockList.splice(pos, 1);
        var element = this.document.childNodes[pos];
        element.parentNode.removeChild(element);
    }

    replaceAtIndex(xmlDataBlock, pos){
        this.deleteAtIndex(pos);
        this.insertAtIndex(xmlDataBlock, pos);
    }

    getXmlDataBlockByBlockPosition(pos){
        if(this.dataBlockList.length > pos){
            return this.dataBlockList[pos];
        }
        return null;
    }

    getXmlDataBlockPositionByTextOffset(offset) {
        let blockOffset = 0;
        let i = 0;
        for (; i < this.dataBlockList.length; i++) {
            if (blockOffset + this.dataBlockList[i].length > offset) {
                return i;
            }
            blockOffset += this.dataBlockList[i].length;
        }
        if(blockOffset != offset)
            throw new Error('The offset: ' + offset + ' is greater than the text size ' + blockOffset + '!');
        else
            return i;
    }

    getXmlDataBlockOffsetByPos(pos){
        if(pos == 0)
            return 0;
        let offset = 0;
        for(let i = 0; i < pos; i++){
            offset += this.dataBlockList[i].length;
        }
        return offset;
    }

    get textContent(){
        let result = "";
        for(let i = 0; i < this.document.childNodes.length; i++){
            result += this.document.childNodes[i].getElementsByTagName('data').item(0).textContent;
        }
        return result;
    }
}
