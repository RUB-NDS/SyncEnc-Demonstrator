import xmlEnc from 'xml-enc/lib/type';

/**
 * Represents the document for testing purpose
 */
export default class Doc{
    constructor(snapshot){
        this._snapshot = snapshot;

    }

    submitOp(ops){
        this._snapshot = xmlEnc.apply(this._snapshot, ops);
    }

    get data(){
        return this._snapshot;
    }
}