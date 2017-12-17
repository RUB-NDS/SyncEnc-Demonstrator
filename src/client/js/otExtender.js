import Delta from 'quill-delta';
import Module from 'quill/core/module';
import xmlEnc from 'xml-enc';
import sharedb from 'sharedb/lib/client';
import XmlWrapper from './xmlWrapper';

sharedb.types.register(xmlEnc.type);

var socket = new WebSocket('ws://' + window.location.host);
var connection = new sharedb.Connection(socket);


window.disconnect = function () {
    connection.close();
};

window.connect = function () {
    var socket = new WebSocket('ws://' + window.location.host);
    connection.bindToSocket(socket);
};
var xmlWrapper = null;
var doc = connection.get('test', 'xml-enc');
new Promise((resolve, reject) => {
    doc.subscribe(function (err) {
        if(err){
            reject(err);
        }else{
            resolve(doc);
        }
    });
}).then((doc) => {
    xmlWrapper =  new XmlWrapper(doc);
});


export class OtExtender extends Module{
    constructor (quill, options){
        super(quill, options);
        this.quill = quill;
        this.options = options;
        this.container = document.querySelector(options.container);
        quill.on('text-change', this.update.bind(this));
    }

    update(delta, oldDelta, source){
        console.log(delta);
        xmlWrapper.quillTextChanged(delta, doc);
        console.log(doc.data);
    }
}

if (window.Quill) {
    window.Quill.register('modules/OtExtender', OtExtender);
}
/*
<root>
    <header></header>
    <document>
        <block>
            <length>length of the data content in plaintext</length>
            <data>content of the block</data>
            <op>Future work -> can be used to send the operation executed in the given block</op>
        </block>
        <block>
            <length>length of the data content in plaintext</length>
            <data>content of the block</data>
            <op>Future work -> can be used to send the operation executed in the given block</op>
        </block>
    </document>
</root>
 */