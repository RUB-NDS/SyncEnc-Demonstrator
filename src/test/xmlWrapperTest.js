import XmlWrapper from '../client/js/xmlWrapper';
import Doc from './doc';
import Delta from 'quill-delta';
import {expect} from 'chai';

var initialDoc = "<root><document></document></root>";

describe('XMLWrapperTest - Text output check, only checks if the output is correct, ' +
    'the xml is not verified', function () {
    describe('insert test', function () {
        it('insert a single character', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() => {
                let delta = new Delta().insert('a');
                xmlWrapper.quillTextChanged(delta);
                expect(xmlWrapper.documentText).to.equal(delta.ops[0].insert);
            });
        });

        it('insert a full block of characters (xml block should be filled with the insert)', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() => {
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE));
                xmlWrapper.quillTextChanged(delta);
                expect(xmlWrapper.documentText).to.equal(delta.ops[0].insert);
            });
        });

        it('insert more than one full block', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() => {
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE + randomUnsignedInt(1, 100)));
                xmlWrapper.quillTextChanged(delta);
                expect(xmlWrapper.documentText).to.equal(delta.ops[0].insert);
            });
        });

        it('insert random characters multiple times', function () {
            let doc = null;
            let xmlWrapper = null;
            let deltaResult = null;
            let allPromises = [];
            for (let i = 0; i < 1000; i++) {
                allPromises.push(generateRandomInsert());
            }
            return Promise.all(allPromises);
        });

        var generateRandomInsert = function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() => {
                let deltaResult = new Delta();
                let delta = new Delta().insert(randomString(Math.floor(Math.random() * 10 + 1)));
                xmlWrapper.quillTextChanged(delta);
                deltaResult = deltaResult.compose(delta);
                expect(xmlWrapper.documentText).to.equal(deltaResult.ops[0].insert);
            });
        };

        it('insert character somewhere', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let deltaResult = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE + randomUnsignedInt(1, 100)));
                xmlWrapper.quillTextChanged(deltaResult);
                let delta = new Delta().retain(randomUnsignedInt(1, xmlWrapper.MAX_BLOCK_SIZE)).insert("0");
                xmlWrapper.quillTextChanged(delta);
                deltaResult = deltaResult.compose(delta);
                expect(xmlWrapper.documentText).to.equal(deltaResult.ops[0].insert);
            });
        });

        it('insert character with attribute', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() =>{
                let delta = new Delta().insert('A', {bold: true});
                xmlWrapper.quillTextChanged(delta);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(delta);
            });
        });
    });

    describe('delete test', function () {

        it("delete a character at pos 2", function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let deltaResult = new Delta().insert("Thiis");
                let delta = new Delta().retain(2).delete(1);
                xmlWrapper.quillTextChanged(deltaResult);
                xmlWrapper.quillTextChanged(delta);
                deltaResult = deltaResult.compose(delta);
                expect(xmlWrapper.documentText).to.equal(deltaResult.ops[0].insert);
            });
        });

        it("delete multiple characters at a random start pos multiple times", function () {
            let promises = [];
            for (var i = 0; i < 100; i++) {
                promises.push(deleteMultipleCharacters());
            }
            return Promise.all(promises);
        });

        var deleteMultipleCharacters = function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() =>{
                let text = randomString(randomUnsignedInt(1, 100));
                let deltaResult = new Delta().insert(text);
                let startPos = randomUnsignedInt(0, text.length - 1);
                let deleteCount = randomUnsignedInt(1, text.length);
                if (deleteCount > text.length - startPos)
                    deleteCount = text.length - startPos;
                let delta = new Delta().retain(startPos).delete(deleteCount);
                xmlWrapper.quillTextChanged(deltaResult);
                xmlWrapper.quillTextChanged(delta);
                let errorMsg = generateInfoMessage(deltaResult, deltaResult.compose(delta), xmlWrapper.documentText,
                     delta);
                deltaResult = deltaResult.compose(delta);

                if (deltaResult.ops[0] === undefined)
                    expect(xmlWrapper.documentText).to.equal('', errorMsg);
                else
                    expect(xmlWrapper.documentText).to.equal(deltaResult.ops[0].insert, errorMsg);
            });
        };
    });

    describe('replace test', function () {

        it("replace a random character (100 times)", function () {
            let promises = [];
            for (var i = 0; i < 100; i++) {
                promises.push(replaceARandomChar());
            }
            return Promise.all(promises);
        });

        var replaceARandomChar = function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let text = randomString(randomUnsignedInt(50, 100));
                let input = new Delta().insert(text);
                let deltaResult = new Delta(input);
                let startPos = randomUnsignedInt(0, 35);
                let delta = new Delta()
                    .retain(startPos)
                    .insert(randomString(randomUnsignedInt(1, 50)))
                    .delete(randomUnsignedInt(1, 20));
                xmlWrapper.quillTextChanged(input);
                xmlWrapper.quillTextChanged(delta);
                let msg = generateInfoMessage(input, deltaResult.compose(delta),
                    xmlWrapper.documentText, delta);
                deltaResult = deltaResult.compose(delta);
                expect(xmlWrapper.documentText).to.equal(deltaResult.ops[0].insert, msg);
            });
        };
    });

    describe('formatting changed', function () {

        it('list formatting', function () {
            let deltaResult = new Delta();
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() =>{
                let op1 = new Delta().insert('a');
                xmlWrapper.quillTextChanged(op1);
                let op2 = new Delta().insert('\n');
                xmlWrapper.quillTextChanged(op2);
                let op3 = new Delta().retain(1, {list: "ordered"});
                xmlWrapper.quillTextChanged(op3);
                let op4 = new Delta().insert('k');
                xmlWrapper.quillTextChanged(op4);
                let op5 = new Delta().retain(1).insert('\n', {list: "ordered"});
                xmlWrapper.quillTextChanged(op5);
                let op6 = new Delta().retain(2).retain(1, {list: null});
                xmlWrapper.quillTextChanged(op6);
                let op7 = new Delta().retain(1).delete(1);
                let op8 = new Delta().retain(1).retain(1, {list: "ordered"});
                xmlWrapper.quillTextChanged(op7);
                xmlWrapper.quillTextChanged(op8);
                deltaResult = deltaResult.compose(op1).compose(op2).compose(op3).compose(op4).compose(op5).compose(op6)
                    .compose(op7).compose(op8);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(deltaResult);
            });
        });

        it('formatting: [ffpp][pppp][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() =>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(xmlWrapper.MAX_BLOCK_SIZE / 2, {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta).compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [pffp][pppp][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE / 4)).retain(xmlWrapper.MAX_BLOCK_SIZE / 2, {bold: true});
                xmlWrapper.quillTextChanged(formatting);
                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [ppff][pppp][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(xmlWrapper.MAX_BLOCK_SIZE / 2)
                    .retain(xmlWrapper.MAX_BLOCK_SIZE / 2, {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [ffff][pppp][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(xmlWrapper.MAX_BLOCK_SIZE, {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [ppff][ffpp][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE / 2))
                    .retain(xmlWrapper.MAX_BLOCK_SIZE, {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });

        });

        it('formatting: [ppff][ffff][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE / 2))
                    .retain(xmlWrapper.MAX_BLOCK_SIZE + xmlWrapper.MAX_BLOCK_SIZE / 2, {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [ppff][ffff][ffpp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE / 2))
                    .retain(xmlWrapper.MAX_BLOCK_SIZE + xmlWrapper.MAX_BLOCK_SIZE, {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [ffff][ffff][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() =>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(xmlWrapper.MAX_BLOCK_SIZE * 2, {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [ffff][ffpp][pppp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE * 1.5), {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('formatting: [pppp][ppff][ffpp]', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(() =>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE * 1.5))
                    .retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE), {bold: true});
                xmlWrapper.quillTextChanged(formatting);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });

        it('multiple formatting', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            return xmlWrapper.shareDbDocumentLoaded().then(()=>{
                let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE * 3));
                xmlWrapper.quillTextChanged(delta);

                let formatting1 = new Delta().retain(xmlWrapper.MAX_BLOCK_SIZE * 3, {bold: true});
                xmlWrapper.quillTextChanged(formatting1);
                let formatting2 = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE * 0.5))
                    .retain(xmlWrapper.MAX_BLOCK_SIZE * 2, {italic: true});
                xmlWrapper.quillTextChanged(formatting2);
                let formatting3 = new Delta().retain(Math.floor(xmlWrapper.MAX_BLOCK_SIZE * 0.75))
                    .retain(xmlWrapper.MAX_BLOCK_SIZE, {underline: true});
                xmlWrapper.quillTextChanged(formatting3);

                let resultDelta = new Delta(delta);
                resultDelta = resultDelta.compose(formatting1);
                resultDelta = resultDelta.compose(formatting2);
                resultDelta = resultDelta.compose(formatting3);
                expect(xmlWrapper.documentTextWithFormatting).to.deep.equal(resultDelta);
            });
        });
    });
});

/**
 * generates a random string with the given length
 * @param length of the random string
 * @returns {string}
 */
var randomString = function (length) {
    var result = "";
    var characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ßÄÖÜäöü";
    for (let i = 0; i < length; i++)
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    return result;
};

/**
 * Generates a random unsigned integer between min and max (both included)
 * @param min value of the random number
 * @param max value of the random number
 * @returns {number}
 */
var randomUnsignedInt = function (min, max) {
    return Math.floor(Math.random() * max + min);
};

var generateInfoMessage = function (inputDelta, expectedDelta, actual, delta) {
    var msg = "\ninput   : " + deltaPrint(inputDelta) + "\n"
        + "expected: " + deltaPrint(expectedDelta) + "\n"
        + "actual  : " + actual + "\n"
        + "delta   : " + deltaPrint(delta);
    return msg;
};

var deltaPrint = function (delta) {
    var msg = "";
    for (let i = 0; i < delta.ops.length; i++) {
        if (delta.ops[i].retain)
            msg += "retain: " + delta.ops[i].retain + " ";
        if (delta.ops[i].insert)
            msg += "insert: " + delta.ops[i].insert + " ";
        if (delta.ops[i].delete)
            msg += "delete: " + delta.ops[i].delete + " ";
    }
    return msg;
}