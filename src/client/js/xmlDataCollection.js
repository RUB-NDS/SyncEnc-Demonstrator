import XmlDataBlock from './xmlDataBlock';
import Delta from 'quill-delta';

export default class xmlDataCollection {
    constructor(documentElement, documentKey) {
        this.document = documentElement;
        this._dataBlockList = [];
        if (documentKey == undefined)
            this.documentKey = null;
        else
            this.documentKey = documentKey;
    }

    /**
     * Initializes the xml data collection. This is required before using any other functions since the blocks might be
     * encrypted. The decryption will be done automatically to ensure that the data can be accessed. The method returns
     * an array with all decryption promises.
     * @returns {Array} an array with promises. Each entry is a promise for one xmlDataBlock. This is required since
     * the xml block must be decrypted before they can be used.
     */
    init() {
        var result = [];
        for (let i = 0; i < this.document.childNodes.length; i++) {
            if (this.documentKey !== null) {
                this._dataBlockList.push(new XmlDataBlock(this.document.childNodes.item(i), this.documentKey));
            } else {
                this._dataBlockList.push(new XmlDataBlock(this.document.childNodes.item(i), null));
            }
            result.push(this._dataBlockList[i].init());
        }
        return result;
    }

    /**
     * Inserts the given xmlDataBlock at the specified position.
     * @param xmlDataBlock that shall be inserted
     * @param pos postion at which the block shall be inserted
     */
    insertAtIndex(xmlDataBlock, pos) {
        this._dataBlockList.splice(pos, 0, xmlDataBlock);
        if (pos == this.document.childNodes.length)
            this.document.appendChild(xmlDataBlock.element);
        else
            this.document.insertBefore(xmlDataBlock.element,
                this.document.childNodes[pos]);
    }

    /**
     * Deletes the block at the given position
     * @param pos of the block that shall be deleted
     */
    deleteAtIndex(pos) {
        this._dataBlockList.splice(pos, 1);
        var element = this.document.childNodes[pos];
        element.parentNode.removeChild(element);
    }

    /**
     * Replaces the corresponding block at the given position
     * @param xmlDataBlock that shall be inserted into the list
     * @param pos position of the block within the list. The existing block at this position will be replaced with the
     * given one
     */
    replaceAtIndex(xmlDataBlock, pos) {
        this.deleteAtIndex(pos);
        this.insertAtIndex(xmlDataBlock, pos);
    }

    /**
     * returns the corresponding block by the given position
     * @param pos position of the requested block
     * @returns {XmlDataBlock} the corresponding xml data block
     */
    getXmlDataBlockByBlockPosition(pos) {
        if(pos < 0)
            return null;
        if (this._dataBlockList.length > pos) {
            return this._dataBlockList[pos];
        }
        return null;
    }

    /**
     * Calculates the block position of the given offset. This is required for converting the quill position to the
     * corresponding block position. (e.g. quill-position 123 != block 123, it might be block 12).
     * (quill text position -> block position)
     * @param offset position based offset (quill position)
     * @returns {number} corresponding block number
     */
    getXmlDataBlockPositionByTextOffset(offset) {
        let blockOffset = 0;
        let i = 0;
        for (; i < this._dataBlockList.length; i++) {
            if (blockOffset + this._dataBlockList[i].length >= offset) {
                return i;
            }
            blockOffset += this._dataBlockList[i].length;
        }
        if (blockOffset != offset)
            throw new Error('The offset: ' + offset + ' is greater than the text size ' + blockOffset + '!');
        else
            return i;
    }

    /**
     * Calculates the text position of the given block position. (block position -> quill text position)
     * @param pos
     * @returns {number}
     */
    getXmlDataBlockOffsetByPos(pos) {
        if (pos == 0)
            return 0;
        let offset = 0;
        for (let i = 0; i < pos; i++) {
            offset += this._dataBlockList[i].length;
        }
        return offset;
    }

    /**
     * Returns all blocks that contains the text of the offset + length. The offset is the quill text position and the
     * length is the text length starting at the offset. (e.g. text pos 100 -> including the next 40 characters)
     * @param offset quill text position (start position)
     * @param length length of the text
     * @returns {Array} array containing all blocks that includes the characters from offset to length
     */
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

    /**
     * submits the RemoteDataBlock operation array
     * @param op an array containing RemoteDataBlock items
     */
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

    /**
     * @returns {Delta} with the entire text content including formatting. The delta can be used to set the initial text
     * content of the quill editor.
     */
    get textContentWithFormattingDelta() {
        let result = new Delta();
        let attributes = null;
        for (let i = 0; i < this._dataBlockList.length; i++) {
            attributes = this._dataBlockList[i].getAttributes();
            if (attributes) {
                result.insert(this._dataBlockList[i].text, attributes);
            } else {
                result.insert(this._dataBlockList[i].text);
            }
        }
        return result;
    }

    /**
     * @returns {Array} all data blocks of the data collection.
     */
    get dataBlockList() {
        return this._dataBlockList;
    }
}
