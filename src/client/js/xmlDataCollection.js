import XmlDataBlock from './xmlDataBlock';
import Delta from 'quill-delta';

export default class xmlDataCollection {
    constructor(documentElement, documentKey) {
        this.document = documentElement;
        this.dataBlockList = [];
        this.documentKey = documentKey;
    }

    init() {
        var result = [];
        for (let i = 0; i < this.document.childNodes.length; i++) {
            if (this.documentKey !== null) {
                this.dataBlockList.push(new XmlDataBlock(this.document.childNodes.item(i), this.documentKey));
            } else {
                this.dataBlockList.push(new XmlDataBlock(this.document.childNodes.item(i)));
            }
            result.push(this.dataBlockList[i].init());
        }
        return result;
    }

    insertAtIndex(xmlDataBlock, pos) {
        this.dataBlockList.splice(pos, 0, xmlDataBlock);
        if (pos == this.document.childNodes.length)
            this.document.appendChild(xmlDataBlock.element);
        else
            this.document.insertBefore(xmlDataBlock.element,
                this.document.childNodes[pos]);
    }

    deleteAtIndex(pos) {
        this.dataBlockList.splice(pos, 1);
        var element = this.document.childNodes[pos];
        element.parentNode.removeChild(element);
    }

    replaceAtIndex(xmlDataBlock, pos) {
        this.deleteAtIndex(pos);
        this.insertAtIndex(xmlDataBlock, pos);
    }

    getXmlDataBlockByBlockPosition(pos) {
        if (this.dataBlockList.length > pos) {
            return this.dataBlockList[pos];
        }
        return null;
    }

    getXmlDataBlockPositionByTextOffset(offset) {
        let blockOffset = 0;
        let i = 0;
        for (; i < this.dataBlockList.length; i++) {
            if (blockOffset + this.dataBlockList[i].length >= offset) {
                return i;
            }
            blockOffset += this.dataBlockList[i].length;
        }
        if (blockOffset != offset)
            throw new Error('The offset: ' + offset + ' is greater than the text size ' + blockOffset + '!');
        else
            return i;
    }

    getXmlDataBlockOffsetByPos(pos) {
        if (pos == 0)
            return 0;
        let offset = 0;
        for (let i = 0; i < pos; i++) {
            offset += this.dataBlockList[i].length;
        }
        return offset;
    }

    getXmlDataBlockListByOffsetAndLength(offset, length) {
        let blockPos = this.getXmlDataBlockPositionByTextOffset(offset);
        let resultBlockLen = this.getXmlDataBlockOffsetByPos(blockPos);
        let blockOffsetEnd = offset + length;
        let result = [];
        let i = 1;
        let currentBlock = this.getXmlDataBlockByBlockPosition(blockPos);
        while (resultBlockLen < blockOffsetEnd && currentBlock != null) {
            result.push(currentBlock);
            resultBlockLen += currentBlock.length;
            currentBlock = this.getXmlDataBlockByBlockPosition(blockPos + i);
            i++;
        }
        return result;
    }

    submitOp(op) {
        for (let i = 0; i < op.length; i++) {
            switch (op[i].op) {
                case 'a':
                    this.insertAtIndex(op[i].xmlDataBlock, op[i].pos);
                    break;
                case 'r':
                    this.replaceAtIndex(op[i].xmlDataBlock, op[i].pos);
                    break;
                case 'd':
                    this.deleteAtIndex(op[i].pos);
                    break;
            }
        }
    }

    get textContentWithFormattingDelta() {
        let result = new Delta();
        let attributes = null;
        for (let i = 0; i < this.dataBlockList.length; i++) {
            attributes = this.dataBlockList[i].getAttributes();
            if (attributes) {
                result.insert(this.dataBlockList[i].text, attributes);
            } else {
                result.insert(this.dataBlockList[i].text);
            }
        }
        return result;
    }

    get textContent() {
        let result = "";
        for (let i = 0; i < this.document.childNodes.length; i++) {
            result += this.document.childNodes[i].getElementsByTagName('data').item(0).textContent;
        }
        return result;
    }
}
