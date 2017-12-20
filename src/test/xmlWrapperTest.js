import XmlWrapper from '../client/js/xmlWrapper';
import Doc from './doc';
import Delta from 'quill-delta';
import assert from 'assert';

var initialDoc = "<root><document></document></root>";

describe('XMLWrapperTest - Text output check, only checks if the output is correct, ' +
    'the xml is not verified', function () {
    describe('insert test', function () {

        it('insert a single character', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            xmlWrapper.reloadXml();
            let delta = new Delta().insert('a');
            xmlWrapper.quillTextChanged(delta);
            assert.equal(xmlWrapper.documentText, delta.ops[0].insert);
        });

        it('insert a full block of characters (xml block should be filled with the insert)', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            xmlWrapper.reloadXml();
            let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE));
            xmlWrapper.quillTextChanged(delta);
            assert.equal(xmlWrapper.documentText, delta.ops[0].insert);
        });

        it('insert more than one full block', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            xmlWrapper.reloadXml();
            let delta = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE +randomUnsignedInt(1,100)));
            xmlWrapper.quillTextChanged(delta);
            assert.equal(xmlWrapper.documentText, delta.ops[0].insert);
        });

        it('insert random characters multiple times', function () {
            let doc = null;
            let xmlWrapper = null;
            let deltaResult = null;
            for(let i = 0; i < 1000; i++){
                doc = new Doc(initialDoc);
                xmlWrapper = new XmlWrapper(doc);
                xmlWrapper.reloadXml();
                deltaResult = new Delta();
                let delta = new Delta().insert(randomString(Math.floor(Math.random() * 10 + 1)));
                xmlWrapper.quillTextChanged(delta);
                deltaResult = deltaResult.compose(delta);
            }
            assert.equal(xmlWrapper.documentText, deltaResult.ops[0].insert);
        });

        it('insert character somewhere', function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            xmlWrapper.reloadXml();
            let deltaResult = new Delta().insert(randomString(xmlWrapper.MAX_BLOCK_SIZE +randomUnsignedInt(1,100)));
            xmlWrapper.quillTextChanged(deltaResult);
            let delta = new Delta().retain(randomUnsignedInt(1,xmlWrapper.MAX_BLOCK_SIZE)).insert("0");
            xmlWrapper.quillTextChanged(delta);
            deltaResult = deltaResult.compose(delta);
            assert.equal(xmlWrapper.documentText, deltaResult.ops[0].insert);
        });
    });

    describe('delete test', function () {

        it("delete a character at pos 2", function () {
            let doc = new Doc(initialDoc);
            let xmlWrapper = new XmlWrapper(doc);
            xmlWrapper.reloadXml();
            let deltaResult = new Delta().insert("Thiis");
            let delta = new Delta().retain(2).delete(1);
            xmlWrapper.quillTextChanged(deltaResult);
            xmlWrapper.quillTextChanged(delta);
            deltaResult = deltaResult.compose(delta);
            assert.equal(xmlWrapper.documentText, deltaResult.ops[0].insert);
        });

        it("delete multiple characters at a random start pos multiple times", function () {
            for(var i = 0; i < 1000; i++) {
                let doc = new Doc(initialDoc)
                let xmlWrapper = new XmlWrapper(doc);
                xmlWrapper.reloadXml();
                let text = randomString(randomUnsignedInt(1, 100));
                let deltaResult = new Delta().insert(text);
                let startPos = randomUnsignedInt(0, text.length - 1);
                let deleteCount = randomUnsignedInt(1, text.length);
                if (deleteCount > text.length - startPos)
                    deleteCount = text.length - startPos;
                let delta = new Delta().retain(startPos).delete(deleteCount);
                xmlWrapper.quillTextChanged(deltaResult);
                xmlWrapper.quillTextChanged(delta);
                deltaResult = deltaResult.compose(delta);
                if(deltaResult.ops[0] === undefined)
                    assert.equal(xmlWrapper.documentText, '');
                else
                    assert.equal(xmlWrapper.documentText, deltaResult.ops[0].insert);
            }
        });
    });

    describe('replace test', function () {

        it("replace a random character (100 times)", function () {
            for(var i = 0; i < 100; i++){
                let doc = new Doc(initialDoc);
                let xmlWrapper = new XmlWrapper(doc);
                xmlWrapper.reloadXml();
                let text = randomString(randomUnsignedInt(50,100));
                let input = new Delta().insert(text);
                let deltaResult = new Delta(input);
                let startPos = randomUnsignedInt(0,35);
                let delta = new Delta()
                    .retain(startPos)
                    .insert(randomString(randomUnsignedInt(1,50)))
                    .delete(randomUnsignedInt(1,20));
                //TODO put into function, check for each operation
                xmlWrapper.quillTextChanged(input);
                xmlWrapper.quillTextChanged(delta);
                let msg = generateInfoMessage(input, deltaResult.compose(delta),
                    xmlWrapper.documentText, delta);
                deltaResult = deltaResult.compose(delta);
                assert.equal(xmlWrapper.documentText, deltaResult.ops[0].insert, msg);
            }
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
    for(let i = 0; i < length; i++)
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    return result;
};

/**
 * Generates a random unsigned integer between min and max (both included)
 * @param min value of the random number
 * @param max value of the random number
 * @returns {number}
 */
var randomUnsignedInt = function(min, max){
    return Math.floor(Math.random() * max + min);
};

var generateInfoMessage = function (inputDelta, expectedDelta, actual, delta){
    var msg = "\ninput   : " + deltaPrint(inputDelta) + "\n"
    + "expected: " + deltaPrint(expectedDelta) + "\n"
    + "actual  : " + actual + "\n"
    + "delta   : " + deltaPrint(delta);
    return msg;
};

var deltaPrint = function (delta) {
    var msg = "";
    for(let i = 0; i < delta.ops.length; i++){
        if(delta.ops[i].retain)
            msg += "retain: " + delta.ops[i].retain + ", ";
        if(delta.ops[i].insert)
            msg += "insert: " + delta.ops[i].insert + ", ";
        if(delta.ops[i].delete)
            msg += "delete: " + delta.ops[i].delete + ", ";
    }
    return msg;
}