/*
 * xpath.js
 *
 * An XPath 1.0 library for JavaScript.
 *
 * Cameron McCormack <cam (at) mcc.id.au>
 *
 * This work is licensed under the MIT License.
 *
 * Revision 20: April 26, 2011
 *   Fixed a typo resulting in FIRST_ORDERED_NODE_TYPE results being wrong,
 *   thanks to <shi_a009 (at) hotmail.com>.
 *
 * Revision 19: November 29, 2005
 *   Nodesets now store their nodes in a height balanced tree, increasing
 *   performance for the common case of selecting nodes in document order,
 *   thanks to S閎astien Cramatte <contact (at) zeninteractif.com>.
 *   AVL tree code adapted from Raimund Neumann <rnova (at) gmx.net>.
 *
 * Revision 18: October 27, 2005
 *   DOM 3 XPath support.  Caveats:
 *     - namespace prefixes aren't resolved in XPathEvaluator.createExpression,
 *       but in XPathExpression.evaluate.
 *     - XPathResult.invalidIteratorState is not implemented.
 *
 * Revision 17: October 25, 2005
 *   Some core XPath function fixes and a patch to avoid crashing certain
 *   versions of MSXML in PathExpr.prototype.getOwnerElement, thanks to
 *   S閎astien Cramatte <contact (at) zeninteractif.com>.
 *
 * Revision 16: September 22, 2005
 *   Workarounds for some IE 5.5 deficiencies.
 *   Fixed problem with prefix node tests on attribute nodes.
 *
 * Revision 15: May 21, 2005
 *   Fixed problem with QName node tests on elements with an xmlns="...".
 *
 * Revision 14: May 19, 2005
 *   Fixed QName node tests on attribute node regression.
 *
 * Revision 13: May 3, 2005
 *   Node tests are case insensitive now if working in an HTML DOM.
 *
 * Revision 12: April 26, 2005
 *   Updated licence.  Slight code changes to enable use of Dean
 *   Edwards' script compression, http://dean.edwards.name/packer/ .
 *
 * Revision 11: April 23, 2005
 *   Fixed bug with 'and' and 'or' operators, fix thanks to
 *   Sandy McArthur <sandy (at) mcarthur.org>.
 *
 * Revision 10: April 15, 2005
 *   Added support for a virtual root node, supposedly helpful for
 *   implementing XForms.  Fixed problem with QName node tests and
 *   the parent axis.
 *
 * Revision 9: March 17, 2005
 *   Namespace resolver tweaked so using the document node as the context
 *   for namespace lookups is equivalent to using the document element.
 *
 * Revision 8: February 13, 2005
 *   Handle implicit declaration of 'xmlns' namespace prefix.
 *   Fixed bug when comparing nodesets.
 *   Instance data can now be associated with a FunctionResolver, and
 *     workaround for MSXML not supporting 'localName' and 'getElementById',
 *     thanks to Grant Gongaware.
 *   Fix a few problems when the context node is the root node.
 *
 * Revision 7: February 11, 2005
 *   Default namespace resolver fix from Grant Gongaware
 *   <grant (at) gongaware.com>.
 *
 * Revision 6: February 10, 2005
 *   Fixed bug in 'number' function.
 *
 * Revision 5: February 9, 2005
 *   Fixed bug where text nodes not getting converted to string values.
 *
 * Revision 4: January 21, 2005
 *   Bug in 'name' function, fix thanks to Bill Edney.
 *   Fixed incorrect processing of namespace nodes.
 *   Fixed NamespaceResolver to resolve 'xml' namespace.
 *   Implemented union '|' operator.
 *
 * Revision 3: January 14, 2005
 *   Fixed bug with nodeset comparisons, bug lexing < and >.
 *
 * Revision 2: October 26, 2004
 *   QName node test namespace handling fixed.  Few other bug fixes.
 *
 * Revision 1: August 13, 2004
 *   Bug fixes from William J. Edney <bedney (at) technicalpursuit.com>.
 *   Added minimal licence.
 *
 * Initial version: June 14, 2004
 */

// non-node wrapper
var xpath = (typeof exports === 'undefined') ? {} : exports;

(function (exports) {
    "use strict";

// functional helpers
    function curry(func) {
        var slice = Array.prototype.slice,
            totalargs = func.length,
            partial = function (args, fn) {
                return function () {
                    return fn.apply(this, args.concat(slice.call(arguments)));
                }
            },
            fn = function () {
                var args = slice.call(arguments);
                return (args.length < totalargs) ?
                    partial(args, fn) :
                    func.apply(this, slice.apply(arguments, [0, totalargs]));
            };
        return fn;
    }

    var forEach = curry(function (f, xs) {
        for (var i = 0; i < xs.length; i += 1) {
            f(xs[i], i, xs);
        }
    });

    var reduce = curry(function (f, seed, xs) {
        var acc = seed;

        forEach(function (x, i) {
            acc = f(acc, x, i);
        }, xs);

        return acc;
    });

    var map = curry(function (f, xs) {
        var mapped = new Array(xs.length);

        forEach(function (x, i) {
            mapped[i] = f(x);
        }, xs);

        return mapped;
    });

    var filter = curry(function (f, xs) {
        var filtered = [];

        forEach(function (x, i) {
            if (f(x, i)) {
                filtered.push(x);
            }
        }, xs);

        return filtered;
    });

    function compose() {
        if (arguments.length === 0) {
            throw new Error('compose requires at least one argument');
        }

        var funcs = Array.prototype.slice.call(arguments).reverse();

        var f0 = funcs[0];
        var fRem = funcs.slice(1);

        return function () {
            return reduce(function (acc, next) {
                return next(acc);
            }, f0.apply(null, arguments), fRem);
        };
    }

    var includes = curry(function (values, value) {
        for (var i = 0; i < values.length; i += 1) {
            if (values[i] === value) {
                return true;
            }
        }

        return false;
    });

    function always(value) {
        return function () {
            return value;
        }
    }

    var prop = curry(function (name, obj) {
        return obj[name];
    });

    function toString(x) {
        return x.toString();
    }

    var join = curry(function (s, xs) {
        return xs.join(s);
    });
    var wrap = curry(function (pref, suf, str) {
        return pref + str + suf;
    });

    function assign(target) { // .length of function is 2
        var to = Object(target);

        for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];

            if (nextSource != null) { // Skip over if undefined or null
                for (var nextKey in nextSource) {
                    // Avoid bugs when hasOwnProperty is shadowed
                    if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                        to[nextKey] = nextSource[nextKey];
                    }
                }
            }
        }

        return to;
    }

// XPathParser ///////////////////////////////////////////////////////////////

    XPathParser.prototype = new Object();
    XPathParser.prototype.constructor = XPathParser;
    XPathParser.superclass = Object.prototype;

    function XPathParser() {
        this.init();
    }

    XPathParser.prototype.init = function () {
        this.reduceActions = [];

        this.reduceActions[3] = function (rhs) {
            return new OrOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[5] = function (rhs) {
            return new AndOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[7] = function (rhs) {
            return new EqualsOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[8] = function (rhs) {
            return new NotEqualOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[10] = function (rhs) {
            return new LessThanOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[11] = function (rhs) {
            return new GreaterThanOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[12] = function (rhs) {
            return new LessThanOrEqualOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[13] = function (rhs) {
            return new GreaterThanOrEqualOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[15] = function (rhs) {
            return new PlusOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[16] = function (rhs) {
            return new MinusOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[18] = function (rhs) {
            return new MultiplyOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[19] = function (rhs) {
            return new DivOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[20] = function (rhs) {
            return new ModOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[22] = function (rhs) {
            return new UnaryMinusOperation(rhs[1]);
        };
        this.reduceActions[24] = function (rhs) {
            return new BarOperation(rhs[0], rhs[2]);
        };
        this.reduceActions[25] = function (rhs) {
            return new PathExpr(undefined, undefined, rhs[0]);
        };
        this.reduceActions[27] = function (rhs) {
            rhs[0].locationPath = rhs[2];
            return rhs[0];
        };
        this.reduceActions[28] = function (rhs) {
            rhs[0].locationPath = rhs[2];
            rhs[0].locationPath.steps.unshift(new Step(Step.DESCENDANTORSELF, NodeTest.nodeTest, []));
            return rhs[0];
        };
        this.reduceActions[29] = function (rhs) {
            return new PathExpr(rhs[0], [], undefined);
        };
        this.reduceActions[30] = function (rhs) {
            if (Utilities.instance_of(rhs[0], PathExpr)) {
                if (rhs[0].filterPredicates == undefined) {
                    rhs[0].filterPredicates = [];
                }
                rhs[0].filterPredicates.push(rhs[1]);
                return rhs[0];
            } else {
                return new PathExpr(rhs[0], [rhs[1]], undefined);
            }
        };
        this.reduceActions[32] = function (rhs) {
            return rhs[1];
        };
        this.reduceActions[33] = function (rhs) {
            return new XString(rhs[0]);
        };
        this.reduceActions[34] = function (rhs) {
            return new XNumber(rhs[0]);
        };
        this.reduceActions[36] = function (rhs) {
            return new FunctionCall(rhs[0], []);
        };
        this.reduceActions[37] = function (rhs) {
            return new FunctionCall(rhs[0], rhs[2]);
        };
        this.reduceActions[38] = function (rhs) {
            return [rhs[0]];
        };
        this.reduceActions[39] = function (rhs) {
            rhs[2].unshift(rhs[0]);
            return rhs[2];
        };
        this.reduceActions[43] = function (rhs) {
            return new LocationPath(true, []);
        };
        this.reduceActions[44] = function (rhs) {
            rhs[1].absolute = true;
            return rhs[1];
        };
        this.reduceActions[46] = function (rhs) {
            return new LocationPath(false, [rhs[0]]);
        };
        this.reduceActions[47] = function (rhs) {
            rhs[0].steps.push(rhs[2]);
            return rhs[0];
        };
        this.reduceActions[49] = function (rhs) {
            return new Step(rhs[0], rhs[1], []);
        };
        this.reduceActions[50] = function (rhs) {
            return new Step(Step.CHILD, rhs[0], []);
        };
        this.reduceActions[51] = function (rhs) {
            return new Step(rhs[0], rhs[1], rhs[2]);
        };
        this.reduceActions[52] = function (rhs) {
            return new Step(Step.CHILD, rhs[0], rhs[1]);
        };
        this.reduceActions[54] = function (rhs) {
            return [rhs[0]];
        };
        this.reduceActions[55] = function (rhs) {
            rhs[1].unshift(rhs[0]);
            return rhs[1];
        };
        this.reduceActions[56] = function (rhs) {
            if (rhs[0] == "ancestor") {
                return Step.ANCESTOR;
            } else if (rhs[0] == "ancestor-or-self") {
                return Step.ANCESTORORSELF;
            } else if (rhs[0] == "attribute") {
                return Step.ATTRIBUTE;
            } else if (rhs[0] == "child") {
                return Step.CHILD;
            } else if (rhs[0] == "descendant") {
                return Step.DESCENDANT;
            } else if (rhs[0] == "descendant-or-self") {
                return Step.DESCENDANTORSELF;
            } else if (rhs[0] == "following") {
                return Step.FOLLOWING;
            } else if (rhs[0] == "following-sibling") {
                return Step.FOLLOWINGSIBLING;
            } else if (rhs[0] == "namespace") {
                return Step.NAMESPACE;
            } else if (rhs[0] == "parent") {
                return Step.PARENT;
            } else if (rhs[0] == "preceding") {
                return Step.PRECEDING;
            } else if (rhs[0] == "preceding-sibling") {
                return Step.PRECEDINGSIBLING;
            } else if (rhs[0] == "self") {
                return Step.SELF;
            }
            return -1;
        };
        this.reduceActions[57] = function (rhs) {
            return Step.ATTRIBUTE;
        };
        this.reduceActions[59] = function (rhs) {
            if (rhs[0] == "comment") {
                return NodeTest.commentTest;
            } else if (rhs[0] == "text") {
                return NodeTest.textTest;
            } else if (rhs[0] == "processing-instruction") {
                return NodeTest.anyPiTest;
            } else if (rhs[0] == "node") {
                return NodeTest.nodeTest;
            }
            return new NodeTest(-1, undefined);
        };
        this.reduceActions[60] = function (rhs) {
            return new NodeTest.PITest(rhs[2]);
        };
        this.reduceActions[61] = function (rhs) {
            return rhs[1];
        };
        this.reduceActions[63] = function (rhs) {
            rhs[1].absolute = true;
            rhs[1].steps.unshift(new Step(Step.DESCENDANTORSELF, NodeTest.nodeTest, []));
            return rhs[1];
        };
        this.reduceActions[64] = function (rhs) {
            rhs[0].steps.push(new Step(Step.DESCENDANTORSELF, NodeTest.nodeTest, []));
            rhs[0].steps.push(rhs[2]);
            return rhs[0];
        };
        this.reduceActions[65] = function (rhs) {
            return new Step(Step.SELF, NodeTest.nodeTest, []);
        };
        this.reduceActions[66] = function (rhs) {
            return new Step(Step.PARENT, NodeTest.nodeTest, []);
        };
        this.reduceActions[67] = function (rhs) {
            return new VariableReference(rhs[1]);
        };
        this.reduceActions[68] = function (rhs) {
            return NodeTest.nameTestAny;
        };
        this.reduceActions[69] = function (rhs) {
            return new NodeTest.NameTestPrefixAny(rhs[0].split(':')[0]);
        };
        this.reduceActions[70] = function (rhs) {
            return new NodeTest.NameTestQName(rhs[0]);
        };
    };

    XPathParser.actionTable = [
        " s s        sssssssss    s ss  s  ss",
        "                 s                  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "                rrrrr               ",
        " s s        sssssssss    s ss  s  ss",
        "rs  rrrrrrrr s  sssssrrrrrr  rrs rs ",
        " s s        sssssssss    s ss  s  ss",
        "                            s       ",
        "                            s       ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "  s                                 ",
        "                            s       ",
        " s           s  sssss          s  s ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "a                                   ",
        "r       s                    rr  r  ",
        "r      sr                    rr  r  ",
        "r   s  rr            s       rr  r  ",
        "r   rssrr            rss     rr  r  ",
        "r   rrrrr            rrrss   rr  r  ",
        "r   rrrrrsss         rrrrr   rr  r  ",
        "r   rrrrrrrr         rrrrr   rr  r  ",
        "r   rrrrrrrr         rrrrrs  rr  r  ",
        "r   rrrrrrrr         rrrrrr  rr  r  ",
        "r   rrrrrrrr         rrrrrr  rr  r  ",
        "r  srrrrrrrr         rrrrrrs rr sr  ",
        "r  srrrrrrrr         rrrrrrs rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r   rrrrrrrr         rrrrrr  rr  r  ",
        "r   rrrrrrrr         rrrrrr  rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "                sssss               ",
        "r  rrrrrrrrr         rrrrrrr rr sr  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "                             s      ",
        "r  srrrrrrrr         rrrrrrs rr  r  ",
        "r   rrrrrrrr         rrrrr   rr  r  ",
        "              s                     ",
        "                             s      ",
        "                rrrrr               ",
        " s s        sssssssss    s sss s  ss",
        "r  srrrrrrrr         rrrrrrs rr  r  ",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s s        sssssssss      ss  s  ss",
        " s s        sssssssss    s ss  s  ss",
        " s           s  sssss          s  s ",
        " s           s  sssss          s  s ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        " s           s  sssss          s  s ",
        " s           s  sssss          s  s ",
        "r  rrrrrrrrr         rrrrrrr rr sr  ",
        "r  rrrrrrrrr         rrrrrrr rr sr  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "                             s      ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "                             rr     ",
        "                             s      ",
        "                             rs     ",
        "r      sr                    rr  r  ",
        "r   s  rr            s       rr  r  ",
        "r   rssrr            rss     rr  r  ",
        "r   rssrr            rss     rr  r  ",
        "r   rrrrr            rrrss   rr  r  ",
        "r   rrrrr            rrrss   rr  r  ",
        "r   rrrrr            rrrss   rr  r  ",
        "r   rrrrr            rrrss   rr  r  ",
        "r   rrrrrsss         rrrrr   rr  r  ",
        "r   rrrrrsss         rrrrr   rr  r  ",
        "r   rrrrrrrr         rrrrr   rr  r  ",
        "r   rrrrrrrr         rrrrr   rr  r  ",
        "r   rrrrrrrr         rrrrr   rr  r  ",
        "r   rrrrrrrr         rrrrrr  rr  r  ",
        "                                 r  ",
        "                                 s  ",
        "r  srrrrrrrr         rrrrrrs rr  r  ",
        "r  srrrrrrrr         rrrrrrs rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr  r  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        " s s        sssssssss    s ss  s  ss",
        "r  rrrrrrrrr         rrrrrrr rr rr  ",
        "                             r      "
    ];

    XPathParser.actionTableNumber = [
        " 1 0        /.-,+*)('    & %$  #  \"!",
        "                 J                  ",
        "a  aaaaaaaaa         aaaaaaa aa  a  ",
        "                YYYYY               ",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        "K1  KKKKKKKK .  +*)('KKKKKK  KK# K\" ",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        "                            N       ",
        "                            O       ",
        "e  eeeeeeeee         eeeeeee ee ee  ",
        "f  fffffffff         fffffff ff ff  ",
        "d  ddddddddd         ddddddd dd dd  ",
        "B  BBBBBBBBB         BBBBBBB BB BB  ",
        "A  AAAAAAAAA         AAAAAAA AA AA  ",
        "  P                                 ",
        "                            Q       ",
        " 1           .  +*)('          #  \" ",
        "b  bbbbbbbbb         bbbbbbb bb  b  ",
        "                                    ",
        "!       S                    !!  !  ",
        "\"      T\"                    \"\"  \"  ",
        "$   V  $$            U       $$  $  ",
        "&   &ZY&&            &XW     &&  &  ",
        ")   )))))            )))\\[   ))  )  ",
        ".   ....._^]         .....   ..  .  ",
        "1   11111111         11111   11  1  ",
        "5   55555555         55555`  55  5  ",
        "7   77777777         777777  77  7  ",
        "9   99999999         999999  99  9  ",
        ":  c::::::::         ::::::b :: a:  ",
        "I  fIIIIIIII         IIIIIIe II  I  ",
        "=  =========         ======= == ==  ",
        "?  ?????????         ??????? ?? ??  ",
        "C  CCCCCCCCC         CCCCCCC CC CC  ",
        "J   JJJJJJJJ         JJJJJJ  JJ  J  ",
        "M   MMMMMMMM         MMMMMM  MM  M  ",
        "N  NNNNNNNNN         NNNNNNN NN  N  ",
        "P  PPPPPPPPP         PPPPPPP PP  P  ",
        "                +*)('               ",
        "R  RRRRRRRRR         RRRRRRR RR aR  ",
        "U  UUUUUUUUU         UUUUUUU UU  U  ",
        "Z  ZZZZZZZZZ         ZZZZZZZ ZZ ZZ  ",
        "c  ccccccccc         ccccccc cc cc  ",
        "                             j      ",
        "L  fLLLLLLLL         LLLLLLe LL  L  ",
        "6   66666666         66666   66  6  ",
        "              k                     ",
        "                             l      ",
        "                XXXXX               ",
        " 1 0        /.-,+*)('    & %$m #  \"!",
        "_  f________         ______e __  _  ",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1 0        /.-,+*)('      %$  #  \"!",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        " 1           .  +*)('          #  \" ",
        " 1           .  +*)('          #  \" ",
        ">  >>>>>>>>>         >>>>>>> >> >>  ",
        " 1           .  +*)('          #  \" ",
        " 1           .  +*)('          #  \" ",
        "Q  QQQQQQQQQ         QQQQQQQ QQ aQ  ",
        "V  VVVVVVVVV         VVVVVVV VV aV  ",
        "T  TTTTTTTTT         TTTTTTT TT  T  ",
        "@  @@@@@@@@@         @@@@@@@ @@ @@  ",
        "                             \x87      ",
        "[  [[[[[[[[[         [[[[[[[ [[ [[  ",
        "D  DDDDDDDDD         DDDDDDD DD DD  ",
        "                             HH     ",
        "                             \x88      ",
        "                             F\x89     ",
        "#      T#                    ##  #  ",
        "%   V  %%            U       %%  %  ",
        "'   'ZY''            'XW     ''  '  ",
        "(   (ZY((            (XW     ((  (  ",
        "+   +++++            +++\\[   ++  +  ",
        "*   *****            ***\\[   **  *  ",
        "-   -----            ---\\[   --  -  ",
        ",   ,,,,,            ,,,\\[   ,,  ,  ",
        "0   00000_^]         00000   00  0  ",
        "/   /////_^]         /////   //  /  ",
        "2   22222222         22222   22  2  ",
        "3   33333333         33333   33  3  ",
        "4   44444444         44444   44  4  ",
        "8   88888888         888888  88  8  ",
        "                                 ^  ",
        "                                 \x8a  ",
        ";  f;;;;;;;;         ;;;;;;e ;;  ;  ",
        "<  f<<<<<<<<         <<<<<<e <<  <  ",
        "O  OOOOOOOOO         OOOOOOO OO  O  ",
        "`  `````````         ``````` ``  `  ",
        "S  SSSSSSSSS         SSSSSSS SS  S  ",
        "W  WWWWWWWWW         WWWWWWW WW  W  ",
        "\\  \\\\\\\\\\\\\\\\\\         \\\\\\\\\\\\\\ \\\\ \\\\  ",
        "E  EEEEEEEEE         EEEEEEE EE EE  ",
        " 1 0        /.-,+*)('    & %$  #  \"!",
        "]  ]]]]]]]]]         ]]]]]]] ]] ]]  ",
        "                             G      "
    ];

    XPathParser.gotoTable = [
        "3456789:;<=>?@ AB  CDEFGH IJ ",
        "                             ",
        "                             ",
        "                             ",
        "L456789:;<=>?@ AB  CDEFGH IJ ",
        "            M        EFGH IJ ",
        "       N;<=>?@ AB  CDEFGH IJ ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "            S        EFGH IJ ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "              e              ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                        h  J ",
        "              i          j   ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "o456789:;<=>?@ ABpqCDEFGH IJ ",
        "                             ",
        "  r6789:;<=>?@ AB  CDEFGH IJ ",
        "   s789:;<=>?@ AB  CDEFGH IJ ",
        "    t89:;<=>?@ AB  CDEFGH IJ ",
        "    u89:;<=>?@ AB  CDEFGH IJ ",
        "     v9:;<=>?@ AB  CDEFGH IJ ",
        "     w9:;<=>?@ AB  CDEFGH IJ ",
        "     x9:;<=>?@ AB  CDEFGH IJ ",
        "     y9:;<=>?@ AB  CDEFGH IJ ",
        "      z:;<=>?@ AB  CDEFGH IJ ",
        "      {:;<=>?@ AB  CDEFGH IJ ",
        "       |;<=>?@ AB  CDEFGH IJ ",
        "       };<=>?@ AB  CDEFGH IJ ",
        "       ~;<=>?@ AB  CDEFGH IJ ",
        "         \x7f=>?@ AB  CDEFGH IJ ",
        "\x80456789:;<=>?@ AB  CDEFGH IJ\x81",
        "            \x82        EFGH IJ ",
        "            \x83        EFGH IJ ",
        "                             ",
        "                     \x84 GH IJ ",
        "                     \x85 GH IJ ",
        "              i          \x86   ",
        "              i          \x87   ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "                             ",
        "o456789:;<=>?@ AB\x8cqCDEFGH IJ ",
        "                             ",
        "                             "
    ];

    XPathParser.productions = [
        [1, 1, 2],
        [2, 1, 3],
        [3, 1, 4],
        [3, 3, 3, -9, 4],
        [4, 1, 5],
        [4, 3, 4, -8, 5],
        [5, 1, 6],
        [5, 3, 5, -22, 6],
        [5, 3, 5, -5, 6],
        [6, 1, 7],
        [6, 3, 6, -23, 7],
        [6, 3, 6, -24, 7],
        [6, 3, 6, -6, 7],
        [6, 3, 6, -7, 7],
        [7, 1, 8],
        [7, 3, 7, -25, 8],
        [7, 3, 7, -26, 8],
        [8, 1, 9],
        [8, 3, 8, -12, 9],
        [8, 3, 8, -11, 9],
        [8, 3, 8, -10, 9],
        [9, 1, 10],
        [9, 2, -26, 9],
        [10, 1, 11],
        [10, 3, 10, -27, 11],
        [11, 1, 12],
        [11, 1, 13],
        [11, 3, 13, -28, 14],
        [11, 3, 13, -4, 14],
        [13, 1, 15],
        [13, 2, 13, 16],
        [15, 1, 17],
        [15, 3, -29, 2, -30],
        [15, 1, -15],
        [15, 1, -16],
        [15, 1, 18],
        [18, 3, -13, -29, -30],
        [18, 4, -13, -29, 19, -30],
        [19, 1, 20],
        [19, 3, 20, -31, 19],
        [20, 1, 2],
        [12, 1, 14],
        [12, 1, 21],
        [21, 1, -28],
        [21, 2, -28, 14],
        [21, 1, 22],
        [14, 1, 23],
        [14, 3, 14, -28, 23],
        [14, 1, 24],
        [23, 2, 25, 26],
        [23, 1, 26],
        [23, 3, 25, 26, 27],
        [23, 2, 26, 27],
        [23, 1, 28],
        [27, 1, 16],
        [27, 2, 16, 27],
        [25, 2, -14, -3],
        [25, 1, -32],
        [26, 1, 29],
        [26, 3, -20, -29, -30],
        [26, 4, -21, -29, -15, -30],
        [16, 3, -33, 30, -34],
        [30, 1, 2],
        [22, 2, -4, 14],
        [24, 3, 14, -4, 23],
        [28, 1, -35],
        [28, 1, -2],
        [17, 2, -36, -18],
        [29, 1, -17],
        [29, 1, -19],
        [29, 1, -18]
    ];

    XPathParser.DOUBLEDOT = 2;
    XPathParser.DOUBLECOLON = 3;
    XPathParser.DOUBLESLASH = 4;
    XPathParser.NOTEQUAL = 5;
    XPathParser.LESSTHANOREQUAL = 6;
    XPathParser.GREATERTHANOREQUAL = 7;
    XPathParser.AND = 8;
    XPathParser.OR = 9;
    XPathParser.MOD = 10;
    XPathParser.DIV = 11;
    XPathParser.MULTIPLYOPERATOR = 12;
    XPathParser.FUNCTIONNAME = 13;
    XPathParser.AXISNAME = 14;
    XPathParser.LITERAL = 15;
    XPathParser.NUMBER = 16;
    XPathParser.ASTERISKNAMETEST = 17;
    XPathParser.QNAME = 18;
    XPathParser.NCNAMECOLONASTERISK = 19;
    XPathParser.NODETYPE = 20;
    XPathParser.PROCESSINGINSTRUCTIONWITHLITERAL = 21;
    XPathParser.EQUALS = 22;
    XPathParser.LESSTHAN = 23;
    XPathParser.GREATERTHAN = 24;
    XPathParser.PLUS = 25;
    XPathParser.MINUS = 26;
    XPathParser.BAR = 27;
    XPathParser.SLASH = 28;
    XPathParser.LEFTPARENTHESIS = 29;
    XPathParser.RIGHTPARENTHESIS = 30;
    XPathParser.COMMA = 31;
    XPathParser.AT = 32;
    XPathParser.LEFTBRACKET = 33;
    XPathParser.RIGHTBRACKET = 34;
    XPathParser.DOT = 35;
    XPathParser.DOLLAR = 36;

    XPathParser.prototype.tokenize = function (s1) {
        var types = [];
        var values = [];
        var s = s1 + '\0';

        var pos = 0;
        var c = s.charAt(pos++);
        while (1) {
            while (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
                c = s.charAt(pos++);
            }
            if (c == '\0' || pos >= s.length) {
                break;
            }

            if (c == '(') {
                types.push(XPathParser.LEFTPARENTHESIS);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == ')') {
                types.push(XPathParser.RIGHTPARENTHESIS);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == '[') {
                types.push(XPathParser.LEFTBRACKET);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == ']') {
                types.push(XPathParser.RIGHTBRACKET);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == '@') {
                types.push(XPathParser.AT);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == ',') {
                types.push(XPathParser.COMMA);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == '|') {
                types.push(XPathParser.BAR);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == '+') {
                types.push(XPathParser.PLUS);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == '-') {
                types.push(XPathParser.MINUS);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == '=') {
                types.push(XPathParser.EQUALS);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }
            if (c == '$') {
                types.push(XPathParser.DOLLAR);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }

            if (c == '.') {
                c = s.charAt(pos++);
                if (c == '.') {
                    types.push(XPathParser.DOUBLEDOT);
                    values.push("..");
                    c = s.charAt(pos++);
                    continue;
                }
                if (c >= '0' && c <= '9') {
                    var number = "." + c;
                    c = s.charAt(pos++);
                    while (c >= '0' && c <= '9') {
                        number += c;
                        c = s.charAt(pos++);
                    }
                    types.push(XPathParser.NUMBER);
                    values.push(number);
                    continue;
                }
                types.push(XPathParser.DOT);
                values.push('.');
                continue;
            }

            if (c == '\'' || c == '"') {
                var delimiter = c;
                var literal = "";
                while (pos < s.length && (c = s.charAt(pos)) !== delimiter) {
                    literal += c;
                    pos += 1;
                }
                if (c !== delimiter) {
                    throw XPathException.fromMessage("Unterminated string literal: " + delimiter + literal);
                }
                pos += 1;
                types.push(XPathParser.LITERAL);
                values.push(literal);
                c = s.charAt(pos++);
                continue;
            }

            if (c >= '0' && c <= '9') {
                var number = c;
                c = s.charAt(pos++);
                while (c >= '0' && c <= '9') {
                    number += c;
                    c = s.charAt(pos++);
                }
                if (c == '.') {
                    if (s.charAt(pos) >= '0' && s.charAt(pos) <= '9') {
                        number += c;
                        number += s.charAt(pos++);
                        c = s.charAt(pos++);
                        while (c >= '0' && c <= '9') {
                            number += c;
                            c = s.charAt(pos++);
                        }
                    }
                }
                types.push(XPathParser.NUMBER);
                values.push(number);
                continue;
            }

            if (c == '*') {
                if (types.length > 0) {
                    var last = types[types.length - 1];
                    if (last != XPathParser.AT
                        && last != XPathParser.DOUBLECOLON
                        && last != XPathParser.LEFTPARENTHESIS
                        && last != XPathParser.LEFTBRACKET
                        && last != XPathParser.AND
                        && last != XPathParser.OR
                        && last != XPathParser.MOD
                        && last != XPathParser.DIV
                        && last != XPathParser.MULTIPLYOPERATOR
                        && last != XPathParser.SLASH
                        && last != XPathParser.DOUBLESLASH
                        && last != XPathParser.BAR
                        && last != XPathParser.PLUS
                        && last != XPathParser.MINUS
                        && last != XPathParser.EQUALS
                        && last != XPathParser.NOTEQUAL
                        && last != XPathParser.LESSTHAN
                        && last != XPathParser.LESSTHANOREQUAL
                        && last != XPathParser.GREATERTHAN
                        && last != XPathParser.GREATERTHANOREQUAL) {
                        types.push(XPathParser.MULTIPLYOPERATOR);
                        values.push(c);
                        c = s.charAt(pos++);
                        continue;
                    }
                }
                types.push(XPathParser.ASTERISKNAMETEST);
                values.push(c);
                c = s.charAt(pos++);
                continue;
            }

            if (c == ':') {
                if (s.charAt(pos) == ':') {
                    types.push(XPathParser.DOUBLECOLON);
                    values.push("::");
                    pos++;
                    c = s.charAt(pos++);
                    continue;
                }
            }

            if (c == '/') {
                c = s.charAt(pos++);
                if (c == '/') {
                    types.push(XPathParser.DOUBLESLASH);
                    values.push("//");
                    c = s.charAt(pos++);
                    continue;
                }
                types.push(XPathParser.SLASH);
                values.push('/');
                continue;
            }

            if (c == '!') {
                if (s.charAt(pos) == '=') {
                    types.push(XPathParser.NOTEQUAL);
                    values.push("!=");
                    pos++;
                    c = s.charAt(pos++);
                    continue;
                }
            }

            if (c == '<') {
                if (s.charAt(pos) == '=') {
                    types.push(XPathParser.LESSTHANOREQUAL);
                    values.push("<=");
                    pos++;
                    c = s.charAt(pos++);
                    continue;
                }
                types.push(XPathParser.LESSTHAN);
                values.push('<');
                c = s.charAt(pos++);
                continue;
            }

            if (c == '>') {
                if (s.charAt(pos) == '=') {
                    types.push(XPathParser.GREATERTHANOREQUAL);
                    values.push(">=");
                    pos++;
                    c = s.charAt(pos++);
                    continue;
                }
                types.push(XPathParser.GREATERTHAN);
                values.push('>');
                c = s.charAt(pos++);
                continue;
            }

            if (c == '_' || Utilities.isLetter(c.charCodeAt(0))) {
                var name = c;
                c = s.charAt(pos++);
                while (Utilities.isNCNameChar(c.charCodeAt(0))) {
                    name += c;
                    c = s.charAt(pos++);
                }
                if (types.length > 0) {
                    var last = types[types.length - 1];
                    if (last != XPathParser.AT
                        && last != XPathParser.DOUBLECOLON
                        && last != XPathParser.LEFTPARENTHESIS
                        && last != XPathParser.LEFTBRACKET
                        && last != XPathParser.AND
                        && last != XPathParser.OR
                        && last != XPathParser.MOD
                        && last != XPathParser.DIV
                        && last != XPathParser.MULTIPLYOPERATOR
                        && last != XPathParser.SLASH
                        && last != XPathParser.DOUBLESLASH
                        && last != XPathParser.BAR
                        && last != XPathParser.PLUS
                        && last != XPathParser.MINUS
                        && last != XPathParser.EQUALS
                        && last != XPathParser.NOTEQUAL
                        && last != XPathParser.LESSTHAN
                        && last != XPathParser.LESSTHANOREQUAL
                        && last != XPathParser.GREATERTHAN
                        && last != XPathParser.GREATERTHANOREQUAL) {
                        if (name == "and") {
                            types.push(XPathParser.AND);
                            values.push(name);
                            continue;
                        }
                        if (name == "or") {
                            types.push(XPathParser.OR);
                            values.push(name);
                            continue;
                        }
                        if (name == "mod") {
                            types.push(XPathParser.MOD);
                            values.push(name);
                            continue;
                        }
                        if (name == "div") {
                            types.push(XPathParser.DIV);
                            values.push(name);
                            continue;
                        }
                    }
                }
                if (c == ':') {
                    if (s.charAt(pos) == '*') {
                        types.push(XPathParser.NCNAMECOLONASTERISK);
                        values.push(name + ":*");
                        pos++;
                        c = s.charAt(pos++);
                        continue;
                    }
                    if (s.charAt(pos) == '_' || Utilities.isLetter(s.charCodeAt(pos))) {
                        name += ':';
                        c = s.charAt(pos++);
                        while (Utilities.isNCNameChar(c.charCodeAt(0))) {
                            name += c;
                            c = s.charAt(pos++);
                        }
                        if (c == '(') {
                            types.push(XPathParser.FUNCTIONNAME);
                            values.push(name);
                            continue;
                        }
                        types.push(XPathParser.QNAME);
                        values.push(name);
                        continue;
                    }
                    if (s.charAt(pos) == ':') {
                        types.push(XPathParser.AXISNAME);
                        values.push(name);
                        continue;
                    }
                }
                if (c == '(') {
                    if (name == "comment" || name == "text" || name == "node") {
                        types.push(XPathParser.NODETYPE);
                        values.push(name);
                        continue;
                    }
                    if (name == "processing-instruction") {
                        if (s.charAt(pos) == ')') {
                            types.push(XPathParser.NODETYPE);
                        } else {
                            types.push(XPathParser.PROCESSINGINSTRUCTIONWITHLITERAL);
                        }
                        values.push(name);
                        continue;
                    }
                    types.push(XPathParser.FUNCTIONNAME);
                    values.push(name);
                    continue;
                }
                types.push(XPathParser.QNAME);
                values.push(name);
                continue;
            }

            throw new Error("Unexpected character " + c);
        }
        types.push(1);
        values.push("[EOF]");
        return [types, values];
    };

    XPathParser.SHIFT = 's';
    XPathParser.REDUCE = 'r';
    XPathParser.ACCEPT = 'a';

    XPathParser.prototype.parse = function (s) {
        var types;
        var values;
        var res = this.tokenize(s);
        if (res == undefined) {
            return undefined;
        }
        types = res[0];
        values = res[1];
        var tokenPos = 0;
        var state = [];
        var tokenType = [];
        var tokenValue = [];
        var s;
        var a;
        var t;

        state.push(0);
        tokenType.push(1);
        tokenValue.push("_S");

        a = types[tokenPos];
        t = values[tokenPos++];
        while (1) {
            s = state[state.length - 1];
            switch (XPathParser.actionTable[s].charAt(a - 1)) {
                case XPathParser.SHIFT:
                    tokenType.push(-a);
                    tokenValue.push(t);
                    state.push(XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32);
                    a = types[tokenPos];
                    t = values[tokenPos++];
                    break;
                case XPathParser.REDUCE:
                    var num = XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][1];
                    var rhs = [];
                    for (var i = 0; i < num; i++) {
                        tokenType.pop();
                        rhs.unshift(tokenValue.pop());
                        state.pop();
                    }
                    var s_ = state[state.length - 1];
                    tokenType.push(XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][0]);
                    if (this.reduceActions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32] == undefined) {
                        tokenValue.push(rhs[0]);
                    } else {
                        tokenValue.push(this.reduceActions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32](rhs));
                    }
                    state.push(XPathParser.gotoTable[s_].charCodeAt(XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][0] - 2) - 33);
                    break;
                case XPathParser.ACCEPT:
                    return new XPath(tokenValue.pop());
                default:
                    throw new Error("XPath parse error");
            }
        }
    };

// XPath /////////////////////////////////////////////////////////////////////

    XPath.prototype = new Object();
    XPath.prototype.constructor = XPath;
    XPath.superclass = Object.prototype;

    function XPath(e) {
        this.expression = e;
    }

    XPath.prototype.toString = function () {
        return this.expression.toString();
    };

    function setIfUnset(obj, prop, value) {
        if (!(prop in obj)) {
            obj[prop] = value;
        }
    }

    XPath.prototype.evaluate = function (c) {
        c.contextNode = c.expressionContextNode;
        c.contextSize = 1;
        c.contextPosition = 1;

        // [2017-11-25] Removed usage of .implementation.hasFeature() since it does
        //              not reliably detect HTML DOMs (always returns false in xmldom and true in browsers)
        if (c.isHtml) {
            setIfUnset(c, 'caseInsensitive', true);
            setIfUnset(c, 'allowAnyNamespaceForNoPrefix', true);
        }

        setIfUnset(c, 'caseInsensitive', false);

        return this.expression.evaluate(c);
    };

    XPath.XML_NAMESPACE_URI = "http://www.w3.org/XML/1998/namespace";
    XPath.XMLNS_NAMESPACE_URI = "http://www.w3.org/2000/xmlns/";

// Expression ////////////////////////////////////////////////////////////////

    Expression.prototype = new Object();
    Expression.prototype.constructor = Expression;
    Expression.superclass = Object.prototype;

    function Expression() {
    }

    Expression.prototype.init = function () {
    };

    Expression.prototype.toString = function () {
        return "<Expression>";
    };

    Expression.prototype.evaluate = function (c) {
        throw new Error("Could not evaluate expression.");
    };

// UnaryOperation ////////////////////////////////////////////////////////////

    UnaryOperation.prototype = new Expression();
    UnaryOperation.prototype.constructor = UnaryOperation;
    UnaryOperation.superclass = Expression.prototype;

    function UnaryOperation(rhs) {
        if (arguments.length > 0) {
            this.init(rhs);
        }
    }

    UnaryOperation.prototype.init = function (rhs) {
        this.rhs = rhs;
    };

// UnaryMinusOperation ///////////////////////////////////////////////////////

    UnaryMinusOperation.prototype = new UnaryOperation();
    UnaryMinusOperation.prototype.constructor = UnaryMinusOperation;
    UnaryMinusOperation.superclass = UnaryOperation.prototype;

    function UnaryMinusOperation(rhs) {
        if (arguments.length > 0) {
            this.init(rhs);
        }
    }

    UnaryMinusOperation.prototype.init = function (rhs) {
        UnaryMinusOperation.superclass.init.call(this, rhs);
    };

    UnaryMinusOperation.prototype.evaluate = function (c) {
        return this.rhs.evaluate(c).number().negate();
    };

    UnaryMinusOperation.prototype.toString = function () {
        return "-" + this.rhs.toString();
    };

// BinaryOperation ///////////////////////////////////////////////////////////

    BinaryOperation.prototype = new Expression();
    BinaryOperation.prototype.constructor = BinaryOperation;
    BinaryOperation.superclass = Expression.prototype;

    function BinaryOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    BinaryOperation.prototype.init = function (lhs, rhs) {
        this.lhs = lhs;
        this.rhs = rhs;
    };

// OrOperation ///////////////////////////////////////////////////////////////

    OrOperation.prototype = new BinaryOperation();
    OrOperation.prototype.constructor = OrOperation;
    OrOperation.superclass = BinaryOperation.prototype;

    function OrOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    OrOperation.prototype.init = function (lhs, rhs) {
        OrOperation.superclass.init.call(this, lhs, rhs);
    };

    OrOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " or " + this.rhs.toString() + ")";
    };

    OrOperation.prototype.evaluate = function (c) {
        var b = this.lhs.evaluate(c).bool();
        if (b.booleanValue()) {
            return b;
        }
        return this.rhs.evaluate(c).bool();
    };

// AndOperation //////////////////////////////////////////////////////////////

    AndOperation.prototype = new BinaryOperation();
    AndOperation.prototype.constructor = AndOperation;
    AndOperation.superclass = BinaryOperation.prototype;

    function AndOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    AndOperation.prototype.init = function (lhs, rhs) {
        AndOperation.superclass.init.call(this, lhs, rhs);
    };

    AndOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " and " + this.rhs.toString() + ")";
    };

    AndOperation.prototype.evaluate = function (c) {
        var b = this.lhs.evaluate(c).bool();
        if (!b.booleanValue()) {
            return b;
        }
        return this.rhs.evaluate(c).bool();
    };

// EqualsOperation ///////////////////////////////////////////////////////////

    EqualsOperation.prototype = new BinaryOperation();
    EqualsOperation.prototype.constructor = EqualsOperation;
    EqualsOperation.superclass = BinaryOperation.prototype;

    function EqualsOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    EqualsOperation.prototype.init = function (lhs, rhs) {
        EqualsOperation.superclass.init.call(this, lhs, rhs);
    };

    EqualsOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " = " + this.rhs.toString() + ")";
    };

    EqualsOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).equals(this.rhs.evaluate(c));
    };

// NotEqualOperation /////////////////////////////////////////////////////////

    NotEqualOperation.prototype = new BinaryOperation();
    NotEqualOperation.prototype.constructor = NotEqualOperation;
    NotEqualOperation.superclass = BinaryOperation.prototype;

    function NotEqualOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    NotEqualOperation.prototype.init = function (lhs, rhs) {
        NotEqualOperation.superclass.init.call(this, lhs, rhs);
    };

    NotEqualOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " != " + this.rhs.toString() + ")";
    };

    NotEqualOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).notequal(this.rhs.evaluate(c));
    };

// LessThanOperation /////////////////////////////////////////////////////////

    LessThanOperation.prototype = new BinaryOperation();
    LessThanOperation.prototype.constructor = LessThanOperation;
    LessThanOperation.superclass = BinaryOperation.prototype;

    function LessThanOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    LessThanOperation.prototype.init = function (lhs, rhs) {
        LessThanOperation.superclass.init.call(this, lhs, rhs);
    };

    LessThanOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).lessthan(this.rhs.evaluate(c));
    };

    LessThanOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " < " + this.rhs.toString() + ")";
    };

// GreaterThanOperation //////////////////////////////////////////////////////

    GreaterThanOperation.prototype = new BinaryOperation();
    GreaterThanOperation.prototype.constructor = GreaterThanOperation;
    GreaterThanOperation.superclass = BinaryOperation.prototype;

    function GreaterThanOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    GreaterThanOperation.prototype.init = function (lhs, rhs) {
        GreaterThanOperation.superclass.init.call(this, lhs, rhs);
    };

    GreaterThanOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).greaterthan(this.rhs.evaluate(c));
    };

    GreaterThanOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " > " + this.rhs.toString() + ")";
    };

// LessThanOrEqualOperation //////////////////////////////////////////////////

    LessThanOrEqualOperation.prototype = new BinaryOperation();
    LessThanOrEqualOperation.prototype.constructor = LessThanOrEqualOperation;
    LessThanOrEqualOperation.superclass = BinaryOperation.prototype;

    function LessThanOrEqualOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    LessThanOrEqualOperation.prototype.init = function (lhs, rhs) {
        LessThanOrEqualOperation.superclass.init.call(this, lhs, rhs);
    };

    LessThanOrEqualOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).lessthanorequal(this.rhs.evaluate(c));
    };

    LessThanOrEqualOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " <= " + this.rhs.toString() + ")";
    };

// GreaterThanOrEqualOperation ///////////////////////////////////////////////

    GreaterThanOrEqualOperation.prototype = new BinaryOperation();
    GreaterThanOrEqualOperation.prototype.constructor = GreaterThanOrEqualOperation;
    GreaterThanOrEqualOperation.superclass = BinaryOperation.prototype;

    function GreaterThanOrEqualOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    GreaterThanOrEqualOperation.prototype.init = function (lhs, rhs) {
        GreaterThanOrEqualOperation.superclass.init.call(this, lhs, rhs);
    };

    GreaterThanOrEqualOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).greaterthanorequal(this.rhs.evaluate(c));
    };

    GreaterThanOrEqualOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " >= " + this.rhs.toString() + ")";
    };

// PlusOperation /////////////////////////////////////////////////////////////

    PlusOperation.prototype = new BinaryOperation();
    PlusOperation.prototype.constructor = PlusOperation;
    PlusOperation.superclass = BinaryOperation.prototype;

    function PlusOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    PlusOperation.prototype.init = function (lhs, rhs) {
        PlusOperation.superclass.init.call(this, lhs, rhs);
    };

    PlusOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).number().plus(this.rhs.evaluate(c).number());
    };

    PlusOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " + " + this.rhs.toString() + ")";
    };

// MinusOperation ////////////////////////////////////////////////////////////

    MinusOperation.prototype = new BinaryOperation();
    MinusOperation.prototype.constructor = MinusOperation;
    MinusOperation.superclass = BinaryOperation.prototype;

    function MinusOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    MinusOperation.prototype.init = function (lhs, rhs) {
        MinusOperation.superclass.init.call(this, lhs, rhs);
    };

    MinusOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).number().minus(this.rhs.evaluate(c).number());
    };

    MinusOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " - " + this.rhs.toString() + ")";
    };

// MultiplyOperation /////////////////////////////////////////////////////////

    MultiplyOperation.prototype = new BinaryOperation();
    MultiplyOperation.prototype.constructor = MultiplyOperation;
    MultiplyOperation.superclass = BinaryOperation.prototype;

    function MultiplyOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    MultiplyOperation.prototype.init = function (lhs, rhs) {
        MultiplyOperation.superclass.init.call(this, lhs, rhs);
    };

    MultiplyOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).number().multiply(this.rhs.evaluate(c).number());
    };

    MultiplyOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " * " + this.rhs.toString() + ")";
    };

// DivOperation //////////////////////////////////////////////////////////////

    DivOperation.prototype = new BinaryOperation();
    DivOperation.prototype.constructor = DivOperation;
    DivOperation.superclass = BinaryOperation.prototype;

    function DivOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    DivOperation.prototype.init = function (lhs, rhs) {
        DivOperation.superclass.init.call(this, lhs, rhs);
    };

    DivOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).number().div(this.rhs.evaluate(c).number());
    };

    DivOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " div " + this.rhs.toString() + ")";
    };

// ModOperation //////////////////////////////////////////////////////////////

    ModOperation.prototype = new BinaryOperation();
    ModOperation.prototype.constructor = ModOperation;
    ModOperation.superclass = BinaryOperation.prototype;

    function ModOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    ModOperation.prototype.init = function (lhs, rhs) {
        ModOperation.superclass.init.call(this, lhs, rhs);
    };

    ModOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).number().mod(this.rhs.evaluate(c).number());
    };

    ModOperation.prototype.toString = function () {
        return "(" + this.lhs.toString() + " mod " + this.rhs.toString() + ")";
    };

// BarOperation //////////////////////////////////////////////////////////////

    BarOperation.prototype = new BinaryOperation();
    BarOperation.prototype.constructor = BarOperation;
    BarOperation.superclass = BinaryOperation.prototype;

    function BarOperation(lhs, rhs) {
        if (arguments.length > 0) {
            this.init(lhs, rhs);
        }
    }

    BarOperation.prototype.init = function (lhs, rhs) {
        BarOperation.superclass.init.call(this, lhs, rhs);
    };

    BarOperation.prototype.evaluate = function (c) {
        return this.lhs.evaluate(c).nodeset().union(this.rhs.evaluate(c).nodeset());
    };

    BarOperation.prototype.toString = function () {
        return map(toString, [this.lhs, this.rhs]).join(' | ');
    };

// PathExpr //////////////////////////////////////////////////////////////////

    PathExpr.prototype = new Expression();
    PathExpr.prototype.constructor = PathExpr;
    PathExpr.superclass = Expression.prototype;

    function PathExpr(filter, filterPreds, locpath) {
        if (arguments.length > 0) {
            this.init(filter, filterPreds, locpath);
        }
    }

    PathExpr.prototype.init = function (filter, filterPreds, locpath) {
        PathExpr.superclass.init.call(this);
        this.filter = filter;
        this.filterPredicates = filterPreds;
        this.locationPath = locpath;
    };

    /**
     * Returns the topmost node of the tree containing node
     */
    function findRoot(node) {
        while (node && node.parentNode) {
            node = node.parentNode;
        }

        return node;
    }

    PathExpr.applyPredicates = function (predicates, c, nodes) {
        return reduce(function (inNodes, pred) {
            var ctx = c.extend({contextSize: inNodes.length});

            return filter(function (node, i) {
                return PathExpr.predicateMatches(pred, ctx.extend({contextNode: node, contextPosition: i + 1}));
            }, inNodes);
        }, nodes, predicates);
    };

    PathExpr.getRoot = function (xpc, nodes) {
        var firstNode = nodes[0];

        if (firstNode.nodeType === 9 /*Node.DOCUMENT_NODE*/) {
            return firstNode;
        }

        if (xpc.virtualRoot) {
            return xpc.virtualRoot;
        }

        var ownerDoc = firstNode.ownerDocument;

        if (ownerDoc) {
            return ownerDoc;
        }

        // IE 5.5 doesn't have ownerDocument?
        var n = firstNode;
        while (n.parentNode != null) {
            n = n.parentNode;
        }
        return n;
    }

    PathExpr.applyStep = function (step, xpc, node) {
        var self = this;
        var newNodes = [];
        xpc.contextNode = node;

        switch (step.axis) {
            case Step.ANCESTOR:
                // look at all the ancestor nodes
                if (xpc.contextNode === xpc.virtualRoot) {
                    break;
                }
                var m;
                if (xpc.contextNode.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
                    m = PathExpr.getOwnerElement(xpc.contextNode);
                } else {
                    m = xpc.contextNode.parentNode;
                }
                while (m != null) {
                    if (step.nodeTest.matches(m, xpc)) {
                        newNodes.push(m);
                    }
                    if (m === xpc.virtualRoot) {
                        break;
                    }
                    m = m.parentNode;
                }
                break;

            case Step.ANCESTORORSELF:
                // look at all the ancestor nodes and the current node
                for (var m = xpc.contextNode; m != null; m = m.nodeType == 2 /*Node.ATTRIBUTE_NODE*/ ? PathExpr.getOwnerElement(m) : m.parentNode) {
                    if (step.nodeTest.matches(m, xpc)) {
                        newNodes.push(m);
                    }
                    if (m === xpc.virtualRoot) {
                        break;
                    }
                }
                break;

            case Step.ATTRIBUTE:
                // look at the attributes
                var nnm = xpc.contextNode.attributes;
                if (nnm != null) {
                    for (var k = 0; k < nnm.length; k++) {
                        var m = nnm.item(k);
                        if (step.nodeTest.matches(m, xpc)) {
                            newNodes.push(m);
                        }
                    }
                }
                break;

            case Step.CHILD:
                // look at all child elements
                for (var m = xpc.contextNode.firstChild; m != null; m = m.nextSibling) {
                    if (step.nodeTest.matches(m, xpc)) {
                        newNodes.push(m);
                    }
                }
                break;

            case Step.DESCENDANT:
                // look at all descendant nodes
                var st = [xpc.contextNode.firstChild];
                while (st.length > 0) {
                    for (var m = st.pop(); m != null;) {
                        if (step.nodeTest.matches(m, xpc)) {
                            newNodes.push(m);
                        }
                        if (m.firstChild != null) {
                            st.push(m.nextSibling);
                            m = m.firstChild;
                        } else {
                            m = m.nextSibling;
                        }
                    }
                }
                break;

            case Step.DESCENDANTORSELF:
                // look at self
                if (step.nodeTest.matches(xpc.contextNode, xpc)) {
                    newNodes.push(xpc.contextNode);
                }
                // look at all descendant nodes
                var st = [xpc.contextNode.firstChild];
                while (st.length > 0) {
                    for (var m = st.pop(); m != null;) {
                        if (step.nodeTest.matches(m, xpc)) {
                            newNodes.push(m);
                        }
                        if (m.firstChild != null) {
                            st.push(m.nextSibling);
                            m = m.firstChild;
                        } else {
                            m = m.nextSibling;
                        }
                    }
                }
                break;

            case Step.FOLLOWING:
                if (xpc.contextNode === xpc.virtualRoot) {
                    break;
                }
                var st = [];
                if (xpc.contextNode.firstChild != null) {
                    st.unshift(xpc.contextNode.firstChild);
                } else {
                    st.unshift(xpc.contextNode.nextSibling);
                }
                for (var m = xpc.contextNode.parentNode; m != null && m.nodeType != 9 /*Node.DOCUMENT_NODE*/ && m !== xpc.virtualRoot; m = m.parentNode) {
                    st.unshift(m.nextSibling);
                }
                do {
                    for (var m = st.pop(); m != null;) {
                        if (step.nodeTest.matches(m, xpc)) {
                            newNodes.push(m);
                        }
                        if (m.firstChild != null) {
                            st.push(m.nextSibling);
                            m = m.firstChild;
                        } else {
                            m = m.nextSibling;
                        }
                    }
                } while (st.length > 0);
                break;

            case Step.FOLLOWINGSIBLING:
                if (xpc.contextNode === xpc.virtualRoot) {
                    break;
                }
                for (var m = xpc.contextNode.nextSibling; m != null; m = m.nextSibling) {
                    if (step.nodeTest.matches(m, xpc)) {
                        newNodes.push(m);
                    }
                }
                break;

            case Step.NAMESPACE:
                var n = {};
                if (xpc.contextNode.nodeType == 1 /*Node.ELEMENT_NODE*/) {
                    n["xml"] = XPath.XML_NAMESPACE_URI;
                    n["xmlns"] = XPath.XMLNS_NAMESPACE_URI;
                    for (var m = xpc.contextNode; m != null && m.nodeType == 1 /*Node.ELEMENT_NODE*/; m = m.parentNode) {
                        for (var k = 0; k < m.attributes.length; k++) {
                            var attr = m.attributes.item(k);
                            var nm = String(attr.name);
                            if (nm == "xmlns") {
                                if (n[""] == undefined) {
                                    n[""] = attr.value;
                                }
                            } else if (nm.length > 6 && nm.substring(0, 6) == "xmlns:") {
                                var pre = nm.substring(6, nm.length);
                                if (n[pre] == undefined) {
                                    n[pre] = attr.value;
                                }
                            }
                        }
                    }
                    for (var pre in n) {
                        var nsn = new XPathNamespace(pre, n[pre], xpc.contextNode);
                        if (step.nodeTest.matches(nsn, xpc)) {
                            newNodes.push(nsn);
                        }
                    }
                }
                break;

            case Step.PARENT:
                m = null;
                if (xpc.contextNode !== xpc.virtualRoot) {
                    if (xpc.contextNode.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
                        m = PathExpr.getOwnerElement(xpc.contextNode);
                    } else {
                        m = xpc.contextNode.parentNode;
                    }
                }
                if (m != null && step.nodeTest.matches(m, xpc)) {
                    newNodes.push(m);
                }
                break;

            case Step.PRECEDING:
                var st;
                if (xpc.virtualRoot != null) {
                    st = [xpc.virtualRoot];
                } else {
                    // cannot rely on .ownerDocument because the node may be in a document fragment
                    st = [findRoot(xpc.contextNode)];
                }
                outer: while (st.length > 0) {
                    for (var m = st.pop(); m != null;) {
                        if (m == xpc.contextNode) {
                            break outer;
                        }
                        if (step.nodeTest.matches(m, xpc)) {
                            newNodes.unshift(m);
                        }
                        if (m.firstChild != null) {
                            st.push(m.nextSibling);
                            m = m.firstChild;
                        } else {
                            m = m.nextSibling;
                        }
                    }
                }
                break;

            case Step.PRECEDINGSIBLING:
                if (xpc.contextNode === xpc.virtualRoot) {
                    break;
                }
                for (var m = xpc.contextNode.previousSibling; m != null; m = m.previousSibling) {
                    if (step.nodeTest.matches(m, xpc)) {
                        newNodes.push(m);
                    }
                }
                break;

            case Step.SELF:
                if (step.nodeTest.matches(xpc.contextNode, xpc)) {
                    newNodes.push(xpc.contextNode);
                }
                break;

            default:
        }

        return newNodes;
    };

    PathExpr.applySteps = function (steps, xpc, nodes) {
        return reduce(function (inNodes, step) {
            return [].concat.apply([], map(function (node) {
                return PathExpr.applyPredicates(step.predicates, xpc, PathExpr.applyStep(step, xpc, node));
            }, inNodes));
        }, nodes, steps);
    }

    PathExpr.prototype.applyFilter = function (c, xpc) {
        if (!this.filter) {
            return {nodes: [c.contextNode]};
        }

        var ns = this.filter.evaluate(c);

        if (!Utilities.instance_of(ns, XNodeSet)) {
            if (this.filterPredicates != null && this.filterPredicates.length > 0 || this.locationPath != null) {
                throw new Error("Path expression filter must evaluate to a nodeset if predicates or location path are used");
            }

            return {nonNodes: ns};
        }

        return {
            nodes: PathExpr.applyPredicates(this.filterPredicates || [], xpc, ns.toUnsortedArray())
        };
    };

    PathExpr.applyLocationPath = function (locationPath, xpc, nodes) {
        if (!locationPath) {
            return nodes;
        }

        var startNodes = locationPath.absolute ? [PathExpr.getRoot(xpc, nodes)] : nodes;

        return PathExpr.applySteps(locationPath.steps, xpc, startNodes);
    };

    PathExpr.prototype.evaluate = function (c) {
        var xpc = assign(new XPathContext(), c);

        var filterResult = this.applyFilter(c, xpc);

        if ('nonNodes' in filterResult) {
            return filterResult.nonNodes;
        }

        var ns = new XNodeSet();
        ns.addArray(PathExpr.applyLocationPath(this.locationPath, xpc, filterResult.nodes));
        return ns;
    };

    PathExpr.predicateMatches = function (pred, c) {
        var res = pred.evaluate(c);

        return Utilities.instance_of(res, XNumber)
            ? c.contextPosition == res.numberValue()
            : res.booleanValue();
    };

    PathExpr.predicateString = compose(wrap('[', ']'), toString);
    PathExpr.predicatesString = compose(join(''), map(PathExpr.predicateString));

    PathExpr.prototype.toString = function () {
        if (this.filter != undefined) {
            var filterStr = toString(this.filter);

            if (Utilities.instance_of(this.filter, XString)) {
                return wrap("'", "'", filterStr);
            }
            if (this.filterPredicates != undefined && this.filterPredicates.length) {
                return wrap('(', ')', filterStr) +
                    PathExpr.predicatesString(this.filterPredicates);
            }
            if (this.locationPath != undefined) {
                return filterStr +
                    (this.locationPath.absolute ? '' : '/') +
                    toString(this.locationPath);
            }

            return filterStr;
        }

        return toString(this.locationPath);
    };

    PathExpr.getOwnerElement = function (n) {
        // DOM 2 has ownerElement
        if (n.ownerElement) {
            return n.ownerElement;
        }
        // DOM 1 Internet Explorer can use selectSingleNode (ironically)
        try {
            if (n.selectSingleNode) {
                return n.selectSingleNode("..");
            }
        } catch (e) {
        }
        // Other DOM 1 implementations must use this egregious search
        var doc = n.nodeType == 9 /*Node.DOCUMENT_NODE*/
            ? n
            : n.ownerDocument;
        var elts = doc.getElementsByTagName("*");
        for (var i = 0; i < elts.length; i++) {
            var elt = elts.item(i);
            var nnm = elt.attributes;
            for (var j = 0; j < nnm.length; j++) {
                var an = nnm.item(j);
                if (an === n) {
                    return elt;
                }
            }
        }
        return null;
    };

// LocationPath //////////////////////////////////////////////////////////////

    LocationPath.prototype = new Object();
    LocationPath.prototype.constructor = LocationPath;
    LocationPath.superclass = Object.prototype;

    function LocationPath(abs, steps) {
        if (arguments.length > 0) {
            this.init(abs, steps);
        }
    }

    LocationPath.prototype.init = function (abs, steps) {
        this.absolute = abs;
        this.steps = steps;
    };

    LocationPath.prototype.toString = function () {
        return (
            (this.absolute ? '/' : '') +
            map(toString, this.steps).join('/')
        );
    };

// Step //////////////////////////////////////////////////////////////////////

    Step.prototype = new Object();
    Step.prototype.constructor = Step;
    Step.superclass = Object.prototype;

    function Step(axis, nodetest, preds) {
        if (arguments.length > 0) {
            this.init(axis, nodetest, preds);
        }
    }

    Step.prototype.init = function (axis, nodetest, preds) {
        this.axis = axis;
        this.nodeTest = nodetest;
        this.predicates = preds;
    };

    Step.prototype.toString = function () {
        return Step.STEPNAMES[this.axis] +
            "::" +
            this.nodeTest.toString() +
            PathExpr.predicatesString(this.predicates);
    };


    Step.ANCESTOR = 0;
    Step.ANCESTORORSELF = 1;
    Step.ATTRIBUTE = 2;
    Step.CHILD = 3;
    Step.DESCENDANT = 4;
    Step.DESCENDANTORSELF = 5;
    Step.FOLLOWING = 6;
    Step.FOLLOWINGSIBLING = 7;
    Step.NAMESPACE = 8;
    Step.PARENT = 9;
    Step.PRECEDING = 10;
    Step.PRECEDINGSIBLING = 11;
    Step.SELF = 12;

    Step.STEPNAMES = reduce(function (acc, x) {
        return acc[x[0]] = x[1], acc;
    }, {}, [
        [Step.ANCESTOR, 'ancestor'],
        [Step.ANCESTORORSELF, 'ancestor-or-self'],
        [Step.ATTRIBUTE, 'attribute'],
        [Step.CHILD, 'child'],
        [Step.DESCENDANT, 'descendant'],
        [Step.DESCENDANTORSELF, 'descendant-or-self'],
        [Step.FOLLOWING, 'following'],
        [Step.FOLLOWINGSIBLING, 'following-sibling'],
        [Step.NAMESPACE, 'namespace'],
        [Step.PARENT, 'parent'],
        [Step.PRECEDING, 'preceding'],
        [Step.PRECEDINGSIBLING, 'preceding-sibling'],
        [Step.SELF, 'self']
    ]);

// NodeTest //////////////////////////////////////////////////////////////////

    NodeTest.prototype = new Object();
    NodeTest.prototype.constructor = NodeTest;
    NodeTest.superclass = Object.prototype;

    function NodeTest(type, value) {
        if (arguments.length > 0) {
            this.init(type, value);
        }
    }

    NodeTest.prototype.init = function (type, value) {
        this.type = type;
        this.value = value;
    };

    NodeTest.prototype.toString = function () {
        return "<unknown nodetest type>";
    };

    NodeTest.prototype.matches = function (n, xpc) {
        console.warn('unknown node test type');
    };

    NodeTest.NAMETESTANY = 0;
    NodeTest.NAMETESTPREFIXANY = 1;
    NodeTest.NAMETESTQNAME = 2;
    NodeTest.COMMENT = 3;
    NodeTest.TEXT = 4;
    NodeTest.PI = 5;
    NodeTest.NODE = 6;

    NodeTest.isNodeType = function (types) {
        return compose(includes(types), prop('nodeType'));
    };

    NodeTest.makeNodeTestType = function (type, members, ctor) {
        var newType = ctor || function () {
        };

        newType.prototype = new NodeTest(members.type);
        newType.prototype.constructor = type;

        for (var key in members) {
            newType.prototype[key] = members[key];
        }

        return newType;
    };
// create invariant node test for certain node types
    NodeTest.makeNodeTypeTest = function (type, nodeTypes, stringVal) {
        return new (NodeTest.makeNodeTestType(type, {
            matches: NodeTest.isNodeType(nodeTypes),
            toString: always(stringVal)
        }))();
    };

    NodeTest.hasPrefix = function (node) {
        return node.prefix || (node.nodeName || node.tagName).indexOf(':') !== -1;
    };

    NodeTest.isElementOrAttribute = NodeTest.isNodeType([1, 2]);
    NodeTest.nameSpaceMatches = function (prefix, xpc, n) {
        var nNamespace = (n.namespaceURI || '');

        if (!prefix) {
            return !nNamespace || (xpc.allowAnyNamespaceForNoPrefix && !NodeTest.hasPrefix(n));
        }

        var ns = xpc.namespaceResolver.getNamespace(prefix, xpc.expressionContextNode);

        if (ns == null) {
            throw new Error("Cannot resolve QName " + prefix);
        }

        return ns === nNamespace;
    };
    NodeTest.localNameMatches = function (localName, xpc, n) {
        var nLocalName = (n.localName || n.nodeName);

        return xpc.caseInsensitive
            ? localName.toLowerCase() === nLocalName.toLowerCase()
            : localName === nLocalName;
    };

    NodeTest.NameTestPrefixAny = NodeTest.makeNodeTestType(NodeTest.NAMETESTPREFIXANY, {
        matches: function (n, xpc) {
            return NodeTest.isElementOrAttribute(n) &&
                NodeTest.nameSpaceMatches(this.prefix, xpc, n);
        },
        toString: function () {
            return this.prefix + ":*";
        }
    }, function (prefix) {
        this.prefix = prefix;
    });

    NodeTest.NameTestQName = NodeTest.makeNodeTestType(NodeTest.NAMETESTQNAME, {
        matches: function (n, xpc) {
            return NodeTest.isNodeType([1, 2, XPathNamespace.XPATH_NAMESPACE_NODE])(n) &&
                NodeTest.nameSpaceMatches(this.prefix, xpc, n) &&
                NodeTest.localNameMatches(this.localName, xpc, n);
        },
        toString: function () {
            return this.name;
        }
    }, function (name) {
        var nameParts = name.split(':');

        this.name = name;
        this.prefix = nameParts.length > 1 ? nameParts[0] : null;
        this.localName = nameParts[nameParts.length > 1 ? 1 : 0];
    });

    NodeTest.PITest = NodeTest.makeNodeTestType(NodeTest.PI, {
        matches: function (n, xpc) {
            return NodeTest.isNodeType([7])(n) && (n.target || n.nodeName) === this.name;
        },
        toString: function () {
            return wrap('processing-instruction("', '")', this.name);
        }
    }, function (name) {
        this.name = name;
    })

// singletons

// elements, attributes, namespaces
    NodeTest.nameTestAny = NodeTest.makeNodeTypeTest(NodeTest.NAMETESTANY, [1, 2, XPathNamespace.XPATH_NAMESPACE_NODE], '*');
// text, cdata
    NodeTest.textTest = NodeTest.makeNodeTypeTest(NodeTest.TEXT, [3, 4], 'text()');
    NodeTest.commentTest = NodeTest.makeNodeTypeTest(NodeTest.COMMENT, [8], 'comment()');
// elements, attributes, text, cdata, PIs, comments, document nodes
    NodeTest.nodeTest = NodeTest.makeNodeTypeTest(NodeTest.NODE, [1, 2, 3, 4, 7, 8, 9], 'node()');
    NodeTest.anyPiTest = NodeTest.makeNodeTypeTest(NodeTest.PI, [7], 'processing-instruction()');

// VariableReference /////////////////////////////////////////////////////////

    VariableReference.prototype = new Expression();
    VariableReference.prototype.constructor = VariableReference;
    VariableReference.superclass = Expression.prototype;

    function VariableReference(v) {
        if (arguments.length > 0) {
            this.init(v);
        }
    }

    VariableReference.prototype.init = function (v) {
        this.variable = v;
    };

    VariableReference.prototype.toString = function () {
        return "$" + this.variable;
    };

    VariableReference.prototype.evaluate = function (c) {
        var parts = Utilities.resolveQName(this.variable, c.namespaceResolver, c.contextNode, false);

        if (parts[0] == null) {
            throw new Error("Cannot resolve QName " + fn);
        }
        var result = c.variableResolver.getVariable(parts[1], parts[0]);
        if (!result) {
            throw XPathException.fromMessage("Undeclared variable: " + this.toString());
        }
        return result;
    };

// FunctionCall //////////////////////////////////////////////////////////////

    FunctionCall.prototype = new Expression();
    FunctionCall.prototype.constructor = FunctionCall;
    FunctionCall.superclass = Expression.prototype;

    function FunctionCall(fn, args) {
        if (arguments.length > 0) {
            this.init(fn, args);
        }
    }

    FunctionCall.prototype.init = function (fn, args) {
        this.functionName = fn;
        this.arguments = args;
    };

    FunctionCall.prototype.toString = function () {
        var s = this.functionName + "(";
        for (var i = 0; i < this.arguments.length; i++) {
            if (i > 0) {
                s += ", ";
            }
            s += this.arguments[i].toString();
        }
        return s + ")";
    };

    FunctionCall.prototype.evaluate = function (c) {
        var f = FunctionResolver.getFunctionFromContext(this.functionName, c);

        if (!f) {
            throw new Error("Unknown function " + this.functionName);
        }

        var a = [c].concat(this.arguments);
        return f.apply(c.functionResolver.thisArg, a);
    };

// Operators /////////////////////////////////////////////////////////////////

    var Operators = new Object();

    Operators.equals = function (l, r) {
        return l.equals(r);
    };

    Operators.notequal = function (l, r) {
        return l.notequal(r);
    };

    Operators.lessthan = function (l, r) {
        return l.lessthan(r);
    };

    Operators.greaterthan = function (l, r) {
        return l.greaterthan(r);
    };

    Operators.lessthanorequal = function (l, r) {
        return l.lessthanorequal(r);
    };

    Operators.greaterthanorequal = function (l, r) {
        return l.greaterthanorequal(r);
    };

// XString ///////////////////////////////////////////////////////////////////

    XString.prototype = new Expression();
    XString.prototype.constructor = XString;
    XString.superclass = Expression.prototype;

    function XString(s) {
        if (arguments.length > 0) {
            this.init(s);
        }
    }

    XString.prototype.init = function (s) {
        this.str = String(s);
    };

    XString.prototype.toString = function () {
        return this.str;
    };

    XString.prototype.evaluate = function (c) {
        return this;
    };

    XString.prototype.string = function () {
        return this;
    };

    XString.prototype.number = function () {
        return new XNumber(this.str);
    };

    XString.prototype.bool = function () {
        return new XBoolean(this.str);
    };

    XString.prototype.nodeset = function () {
        throw new Error("Cannot convert string to nodeset");
    };

    XString.prototype.stringValue = function () {
        return this.str;
    };

    XString.prototype.numberValue = function () {
        return this.number().numberValue();
    };

    XString.prototype.booleanValue = function () {
        return this.bool().booleanValue();
    };

    XString.prototype.equals = function (r) {
        if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().equals(r);
        }
        if (Utilities.instance_of(r, XNumber)) {
            return this.number().equals(r);
        }
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithString(this, Operators.equals);
        }
        return new XBoolean(this.str == r.str);
    };

    XString.prototype.notequal = function (r) {
        if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().notequal(r);
        }
        if (Utilities.instance_of(r, XNumber)) {
            return this.number().notequal(r);
        }
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithString(this, Operators.notequal);
        }
        return new XBoolean(this.str != r.str);
    };

    XString.prototype.lessthan = function (r) {
        return this.number().lessthan(r);
    };

    XString.prototype.greaterthan = function (r) {
        return this.number().greaterthan(r);
    };

    XString.prototype.lessthanorequal = function (r) {
        return this.number().lessthanorequal(r);
    };

    XString.prototype.greaterthanorequal = function (r) {
        return this.number().greaterthanorequal(r);
    };

// XNumber ///////////////////////////////////////////////////////////////////

    XNumber.prototype = new Expression();
    XNumber.prototype.constructor = XNumber;
    XNumber.superclass = Expression.prototype;

    function XNumber(n) {
        if (arguments.length > 0) {
            this.init(n);
        }
    }

    XNumber.prototype.init = function (n) {
        this.num = typeof n === "string" ? this.parse(n) : Number(n);
    };

    XNumber.prototype.numberFormat = /^\s*-?[0-9]*\.?[0-9]+\s*$/;

    XNumber.prototype.parse = function (s) {
        // XPath representation of numbers is more restrictive than what Number() or parseFloat() allow
        return this.numberFormat.test(s) ? parseFloat(s) : Number.NaN;
    };

    function padSmallNumber(numberStr) {
        var parts = numberStr.split('e-');
        var base = parts[0].replace('.', '');
        var exponent = Number(parts[1]);

        for (var i = 0; i < exponent - 1; i += 1) {
            base = '0' + base;
        }

        return '0.' + base;
    }

    function padLargeNumber(numberStr) {
        var parts = numberStr.split('e');
        var base = parts[0].replace('.', '');
        var exponent = Number(parts[1]);
        var zerosToAppend = exponent + 1 - base.length;

        for (var i = 0; i < zerosToAppend; i += 1) {
            base += '0';
        }

        return base;
    }

    XNumber.prototype.toString = function () {
        var strValue = this.num.toString();

        if (strValue.indexOf('e-') !== -1) {
            return padSmallNumber(strValue);
        }

        if (strValue.indexOf('e') !== -1) {
            return padLargeNumber(strValue);
        }

        return strValue;
    };

    XNumber.prototype.evaluate = function (c) {
        return this;
    };

    XNumber.prototype.string = function () {


        return new XString(this.toString());
    };

    XNumber.prototype.number = function () {
        return this;
    };

    XNumber.prototype.bool = function () {
        return new XBoolean(this.num);
    };

    XNumber.prototype.nodeset = function () {
        throw new Error("Cannot convert number to nodeset");
    };

    XNumber.prototype.stringValue = function () {
        return this.string().stringValue();
    };

    XNumber.prototype.numberValue = function () {
        return this.num;
    };

    XNumber.prototype.booleanValue = function () {
        return this.bool().booleanValue();
    };

    XNumber.prototype.negate = function () {
        return new XNumber(-this.num);
    };

    XNumber.prototype.equals = function (r) {
        if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().equals(r);
        }
        if (Utilities.instance_of(r, XString)) {
            return this.equals(r.number());
        }
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.equals);
        }
        return new XBoolean(this.num == r.num);
    };

    XNumber.prototype.notequal = function (r) {
        if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().notequal(r);
        }
        if (Utilities.instance_of(r, XString)) {
            return this.notequal(r.number());
        }
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.notequal);
        }
        return new XBoolean(this.num != r.num);
    };

    XNumber.prototype.lessthan = function (r) {
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.greaterthan);
        }
        if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.lessthan(r.number());
        }
        return new XBoolean(this.num < r.num);
    };

    XNumber.prototype.greaterthan = function (r) {
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.lessthan);
        }
        if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.greaterthan(r.number());
        }
        return new XBoolean(this.num > r.num);
    };

    XNumber.prototype.lessthanorequal = function (r) {
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.greaterthanorequal);
        }
        if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.lessthanorequal(r.number());
        }
        return new XBoolean(this.num <= r.num);
    };

    XNumber.prototype.greaterthanorequal = function (r) {
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.lessthanorequal);
        }
        if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.greaterthanorequal(r.number());
        }
        return new XBoolean(this.num >= r.num);
    };

    XNumber.prototype.plus = function (r) {
        return new XNumber(this.num + r.num);
    };

    XNumber.prototype.minus = function (r) {
        return new XNumber(this.num - r.num);
    };

    XNumber.prototype.multiply = function (r) {
        return new XNumber(this.num * r.num);
    };

    XNumber.prototype.div = function (r) {
        return new XNumber(this.num / r.num);
    };

    XNumber.prototype.mod = function (r) {
        return new XNumber(this.num % r.num);
    };

// XBoolean //////////////////////////////////////////////////////////////////

    XBoolean.prototype = new Expression();
    XBoolean.prototype.constructor = XBoolean;
    XBoolean.superclass = Expression.prototype;

    function XBoolean(b) {
        if (arguments.length > 0) {
            this.init(b);
        }
    }

    XBoolean.prototype.init = function (b) {
        this.b = Boolean(b);
    };

    XBoolean.prototype.toString = function () {
        return this.b.toString();
    };

    XBoolean.prototype.evaluate = function (c) {
        return this;
    };

    XBoolean.prototype.string = function () {
        return new XString(this.b);
    };

    XBoolean.prototype.number = function () {
        return new XNumber(this.b);
    };

    XBoolean.prototype.bool = function () {
        return this;
    };

    XBoolean.prototype.nodeset = function () {
        throw new Error("Cannot convert boolean to nodeset");
    };

    XBoolean.prototype.stringValue = function () {
        return this.string().stringValue();
    };

    XBoolean.prototype.numberValue = function () {
        return this.number().numberValue();
    };

    XBoolean.prototype.booleanValue = function () {
        return this.b;
    };

    XBoolean.prototype.not = function () {
        return new XBoolean(!this.b);
    };

    XBoolean.prototype.equals = function (r) {
        if (Utilities.instance_of(r, XString) || Utilities.instance_of(r, XNumber)) {
            return this.equals(r.bool());
        }
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithBoolean(this, Operators.equals);
        }
        return new XBoolean(this.b == r.b);
    };

    XBoolean.prototype.notequal = function (r) {
        if (Utilities.instance_of(r, XString) || Utilities.instance_of(r, XNumber)) {
            return this.notequal(r.bool());
        }
        if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithBoolean(this, Operators.notequal);
        }
        return new XBoolean(this.b != r.b);
    };

    XBoolean.prototype.lessthan = function (r) {
        return this.number().lessthan(r);
    };

    XBoolean.prototype.greaterthan = function (r) {
        return this.number().greaterthan(r);
    };

    XBoolean.prototype.lessthanorequal = function (r) {
        return this.number().lessthanorequal(r);
    };

    XBoolean.prototype.greaterthanorequal = function (r) {
        return this.number().greaterthanorequal(r);
    };

    XBoolean.true_ = new XBoolean(true);
    XBoolean.false_ = new XBoolean(false);

// AVLTree ///////////////////////////////////////////////////////////////////

    AVLTree.prototype = new Object();
    AVLTree.prototype.constructor = AVLTree;
    AVLTree.superclass = Object.prototype;

    function AVLTree(n) {
        this.init(n);
    }

    AVLTree.prototype.init = function (n) {
        this.left = null;
        this.right = null;
        this.node = n;
        this.depth = 1;
    };

    AVLTree.prototype.balance = function () {
        var ldepth = this.left == null ? 0 : this.left.depth;
        var rdepth = this.right == null ? 0 : this.right.depth;

        if (ldepth > rdepth + 1) {
            // LR or LL rotation
            var lldepth = this.left.left == null ? 0 : this.left.left.depth;
            var lrdepth = this.left.right == null ? 0 : this.left.right.depth;

            if (lldepth < lrdepth) {
                // LR rotation consists of a RR rotation of the left child
                this.left.rotateRR();
                // plus a LL rotation of this node, which happens anyway
            }
            this.rotateLL();
        } else if (ldepth + 1 < rdepth) {
            // RR or RL rorarion
            var rrdepth = this.right.right == null ? 0 : this.right.right.depth;
            var rldepth = this.right.left == null ? 0 : this.right.left.depth;

            if (rldepth > rrdepth) {
                // RR rotation consists of a LL rotation of the right child
                this.right.rotateLL();
                // plus a RR rotation of this node, which happens anyway
            }
            this.rotateRR();
        }
    };

    AVLTree.prototype.rotateLL = function () {
        // the left side is too long => rotate from the left (_not_ leftwards)
        var nodeBefore = this.node;
        var rightBefore = this.right;
        this.node = this.left.node;
        this.right = this.left;
        this.left = this.left.left;
        this.right.left = this.right.right;
        this.right.right = rightBefore;
        this.right.node = nodeBefore;
        this.right.updateInNewLocation();
        this.updateInNewLocation();
    };

    AVLTree.prototype.rotateRR = function () {
        // the right side is too long => rotate from the right (_not_ rightwards)
        var nodeBefore = this.node;
        var leftBefore = this.left;
        this.node = this.right.node;
        this.left = this.right;
        this.right = this.right.right;
        this.left.right = this.left.left;
        this.left.left = leftBefore;
        this.left.node = nodeBefore;
        this.left.updateInNewLocation();
        this.updateInNewLocation();
    };

    AVLTree.prototype.updateInNewLocation = function () {
        this.getDepthFromChildren();
    };

    AVLTree.prototype.getDepthFromChildren = function () {
        this.depth = this.node == null ? 0 : 1;
        if (this.left != null) {
            this.depth = this.left.depth + 1;
        }
        if (this.right != null && this.depth <= this.right.depth) {
            this.depth = this.right.depth + 1;
        }
    };

    function nodeOrder(n1, n2) {
        if (n1 === n2) {
            return 0;
        }

        if (n1.compareDocumentPosition) {
            var cpos = n1.compareDocumentPosition(n2);

            if (cpos & 0x01) {
                // not in the same document; return an arbitrary result (is there a better way to do this)
                return 1;
            }
            if (cpos & 0x0A) {
                // n2 precedes or contains n1
                return 1;
            }
            if (cpos & 0x14) {
                // n2 follows or is contained by n1
                return -1;
            }

            return 0;
        }

        var d1 = 0,
            d2 = 0;
        for (var m1 = n1; m1 != null; m1 = m1.parentNode || m1.ownerElement) {
            d1++;
        }
        for (var m2 = n2; m2 != null; m2 = m2.parentNode || m2.ownerElement) {
            d2++;
        }

        // step up to same depth
        if (d1 > d2) {
            while (d1 > d2) {
                n1 = n1.parentNode || n1.ownerElement;
                d1--;
            }
            if (n1 === n2) {
                return 1;
            }
        } else if (d2 > d1) {
            while (d2 > d1) {
                n2 = n2.parentNode || n2.ownerElement;
                d2--;
            }
            if (n1 === n2) {
                return -1;
            }
        }

        var n1Par = n1.parentNode || n1.ownerElement,
            n2Par = n2.parentNode || n2.ownerElement;

        // find common parent
        while (n1Par !== n2Par) {
            n1 = n1Par;
            n2 = n2Par;
            n1Par = n1.parentNode || n1.ownerElement;
            n2Par = n2.parentNode || n2.ownerElement;
        }

        var n1isAttr = Utilities.isAttribute(n1);
        var n2isAttr = Utilities.isAttribute(n2);

        if (n1isAttr && !n2isAttr) {
            return -1;
        }
        if (!n1isAttr && n2isAttr) {
            return 1;
        }

        if (n1Par) {
            var cn = n1isAttr ? n1Par.attributes : n1Par.childNodes,
                len = cn.length;
            for (var i = 0; i < len; i += 1) {
                var n = cn[i];
                if (n === n1) {
                    return -1;
                }
                if (n === n2) {
                    return 1;
                }
            }
        }

        throw new Error('Unexpected: could not determine node order');
    }

    AVLTree.prototype.add = function (n) {
        if (n === this.node) {
            return false;
        }

        var o = nodeOrder(n, this.node);

        var ret = false;
        if (o == -1) {
            if (this.left == null) {
                this.left = new AVLTree(n);
                ret = true;
            } else {
                ret = this.left.add(n);
                if (ret) {
                    this.balance();
                }
            }
        } else if (o == 1) {
            if (this.right == null) {
                this.right = new AVLTree(n);
                ret = true;
            } else {
                ret = this.right.add(n);
                if (ret) {
                    this.balance();
                }
            }
        }

        if (ret) {
            this.getDepthFromChildren();
        }
        return ret;
    };

// XNodeSet //////////////////////////////////////////////////////////////////

    XNodeSet.prototype = new Expression();
    XNodeSet.prototype.constructor = XNodeSet;
    XNodeSet.superclass = Expression.prototype;

    function XNodeSet() {
        this.init();
    }

    XNodeSet.prototype.init = function () {
        this.tree = null;
        this.nodes = [];
        this.size = 0;
    };

    XNodeSet.prototype.toString = function () {
        var p = this.first();
        if (p == null) {
            return "";
        }
        return this.stringForNode(p);
    };

    XNodeSet.prototype.evaluate = function (c) {
        return this;
    };

    XNodeSet.prototype.string = function () {
        return new XString(this.toString());
    };

    XNodeSet.prototype.stringValue = function () {
        return this.toString();
    };

    XNodeSet.prototype.number = function () {
        return new XNumber(this.string());
    };

    XNodeSet.prototype.numberValue = function () {
        return Number(this.string());
    };

    XNodeSet.prototype.bool = function () {
        return new XBoolean(this.booleanValue());
    };

    XNodeSet.prototype.booleanValue = function () {
        return !!this.size;
    };

    XNodeSet.prototype.nodeset = function () {
        return this;
    };

    XNodeSet.prototype.stringForNode = function (n) {
        if (n.nodeType == 9   /*Node.DOCUMENT_NODE*/ ||
            n.nodeType == 1   /*Node.ELEMENT_NODE */ ||
            n.nodeType === 11 /*Node.DOCUMENT_FRAGMENT*/) {
            return this.stringForContainerNode(n);
        }
        if (n.nodeType === 2 /* Node.ATTRIBUTE_NODE */) {
            return n.value || n.nodeValue;
        }
        if (n.isNamespaceNode) {
            return n.namespace;
        }
        return n.nodeValue;
    };

    XNodeSet.prototype.stringForContainerNode = function (n) {
        var s = "";
        for (var n2 = n.firstChild; n2 != null; n2 = n2.nextSibling) {
            var nt = n2.nodeType;
            //  Element,    Text,       CDATA,      Document,   Document Fragment
            if (nt === 1 || nt === 3 || nt === 4 || nt === 9 || nt === 11) {
                s += this.stringForNode(n2);
            }
        }
        return s;
    };

    XNodeSet.prototype.buildTree = function () {
        if (!this.tree && this.nodes.length) {
            this.tree = new AVLTree(this.nodes[0]);
            for (var i = 1; i < this.nodes.length; i += 1) {
                this.tree.add(this.nodes[i]);
            }
        }

        return this.tree;
    };

    XNodeSet.prototype.first = function () {
        var p = this.buildTree();
        if (p == null) {
            return null;
        }
        while (p.left != null) {
            p = p.left;
        }
        return p.node;
    };

    XNodeSet.prototype.add = function (n) {
        for (var i = 0; i < this.nodes.length; i += 1) {
            if (n === this.nodes[i]) {
                return;
            }
        }

        this.tree = null;
        this.nodes.push(n);
        this.size += 1;
    };

    XNodeSet.prototype.addArray = function (ns) {
        var self = this;

        forEach(function (x) {
            self.add(x);
        }, ns);
    };

    /**
     * Returns an array of the node set's contents in document order
     */
    XNodeSet.prototype.toArray = function () {
        var a = [];
        this.toArrayRec(this.buildTree(), a);
        return a;
    };

    XNodeSet.prototype.toArrayRec = function (t, a) {
        if (t != null) {
            this.toArrayRec(t.left, a);
            a.push(t.node);
            this.toArrayRec(t.right, a);
        }
    };

    /**
     * Returns an array of the node set's contents in arbitrary order
     */
    XNodeSet.prototype.toUnsortedArray = function () {
        return this.nodes.slice();
    };

    XNodeSet.prototype.compareWithString = function (r, o) {
        var a = this.toUnsortedArray();
        for (var i = 0; i < a.length; i++) {
            var n = a[i];
            var l = new XString(this.stringForNode(n));
            var res = o(l, r);
            if (res.booleanValue()) {
                return res;
            }
        }
        return new XBoolean(false);
    };

    XNodeSet.prototype.compareWithNumber = function (r, o) {
        var a = this.toUnsortedArray();
        for (var i = 0; i < a.length; i++) {
            var n = a[i];
            var l = new XNumber(this.stringForNode(n));
            var res = o(l, r);
            if (res.booleanValue()) {
                return res;
            }
        }
        return new XBoolean(false);
    };

    XNodeSet.prototype.compareWithBoolean = function (r, o) {
        return o(this.bool(), r);
    };

    XNodeSet.prototype.compareWithNodeSet = function (r, o) {
        var arr = this.toUnsortedArray();
        var oInvert = function (lop, rop) {
            return o(rop, lop);
        };

        for (var i = 0; i < arr.length; i++) {
            var l = new XString(this.stringForNode(arr[i]));

            var res = r.compareWithString(l, oInvert);
            if (res.booleanValue()) {
                return res;
            }
        }

        return new XBoolean(false);
    };

    XNodeSet.compareWith = curry(function (o, r) {
        if (Utilities.instance_of(r, XString)) {
            return this.compareWithString(r, o);
        }
        if (Utilities.instance_of(r, XNumber)) {
            return this.compareWithNumber(r, o);
        }
        if (Utilities.instance_of(r, XBoolean)) {
            return this.compareWithBoolean(r, o);
        }
        return this.compareWithNodeSet(r, o);
    });

    XNodeSet.prototype.equals = XNodeSet.compareWith(Operators.equals);
    XNodeSet.prototype.notequal = XNodeSet.compareWith(Operators.notequal);
    XNodeSet.prototype.lessthan = XNodeSet.compareWith(Operators.lessthan);
    XNodeSet.prototype.greaterthan = XNodeSet.compareWith(Operators.greaterthan);
    XNodeSet.prototype.lessthanorequal = XNodeSet.compareWith(Operators.lessthanorequal);
    XNodeSet.prototype.greaterthanorequal = XNodeSet.compareWith(Operators.greaterthanorequal);

    XNodeSet.prototype.union = function (r) {
        var ns = new XNodeSet();
        ns.addArray(this.toUnsortedArray());
        ns.addArray(r.toUnsortedArray());
        return ns;
    };

// XPathNamespace ////////////////////////////////////////////////////////////

    XPathNamespace.prototype = new Object();
    XPathNamespace.prototype.constructor = XPathNamespace;
    XPathNamespace.superclass = Object.prototype;

    function XPathNamespace(pre, ns, p) {
        this.isXPathNamespace = true;
        this.ownerDocument = p.ownerDocument;
        this.nodeName = "#namespace";
        this.prefix = pre;
        this.localName = pre;
        this.namespaceURI = ns;
        this.nodeValue = ns;
        this.ownerElement = p;
        this.nodeType = XPathNamespace.XPATH_NAMESPACE_NODE;
    }

    XPathNamespace.prototype.toString = function () {
        return "{ \"" + this.prefix + "\", \"" + this.namespaceURI + "\" }";
    };

// XPathContext //////////////////////////////////////////////////////////////

    XPathContext.prototype = new Object();
    XPathContext.prototype.constructor = XPathContext;
    XPathContext.superclass = Object.prototype;

    function XPathContext(vr, nr, fr) {
        this.variableResolver = vr != null ? vr : new VariableResolver();
        this.namespaceResolver = nr != null ? nr : new NamespaceResolver();
        this.functionResolver = fr != null ? fr : new FunctionResolver();
    }

    XPathContext.prototype.extend = function (newProps) {
        return assign(new XPathContext(), this, newProps);
    };

// VariableResolver //////////////////////////////////////////////////////////

    VariableResolver.prototype = new Object();
    VariableResolver.prototype.constructor = VariableResolver;
    VariableResolver.superclass = Object.prototype;

    function VariableResolver() {
    }

    VariableResolver.prototype.getVariable = function (ln, ns) {
        return null;
    };

// FunctionResolver //////////////////////////////////////////////////////////

    FunctionResolver.prototype = new Object();
    FunctionResolver.prototype.constructor = FunctionResolver;
    FunctionResolver.superclass = Object.prototype;

    function FunctionResolver(thisArg) {
        this.thisArg = thisArg != null ? thisArg : Functions;
        this.functions = new Object();
        this.addStandardFunctions();
    }

    FunctionResolver.prototype.addStandardFunctions = function () {
        this.functions["{}last"] = Functions.last;
        this.functions["{}position"] = Functions.position;
        this.functions["{}count"] = Functions.count;
        this.functions["{}id"] = Functions.id;
        this.functions["{}local-name"] = Functions.localName;
        this.functions["{}namespace-uri"] = Functions.namespaceURI;
        this.functions["{}name"] = Functions.name;
        this.functions["{}string"] = Functions.string;
        this.functions["{}concat"] = Functions.concat;
        this.functions["{}starts-with"] = Functions.startsWith;
        this.functions["{}contains"] = Functions.contains;
        this.functions["{}substring-before"] = Functions.substringBefore;
        this.functions["{}substring-after"] = Functions.substringAfter;
        this.functions["{}substring"] = Functions.substring;
        this.functions["{}string-length"] = Functions.stringLength;
        this.functions["{}normalize-space"] = Functions.normalizeSpace;
        this.functions["{}translate"] = Functions.translate;
        this.functions["{}boolean"] = Functions.boolean_;
        this.functions["{}not"] = Functions.not;
        this.functions["{}true"] = Functions.true_;
        this.functions["{}false"] = Functions.false_;
        this.functions["{}lang"] = Functions.lang;
        this.functions["{}number"] = Functions.number;
        this.functions["{}sum"] = Functions.sum;
        this.functions["{}floor"] = Functions.floor;
        this.functions["{}ceiling"] = Functions.ceiling;
        this.functions["{}round"] = Functions.round;
    };

    FunctionResolver.prototype.addFunction = function (ns, ln, f) {
        this.functions["{" + ns + "}" + ln] = f;
    };

    FunctionResolver.getFunctionFromContext = function (qName, context) {
        var parts = Utilities.resolveQName(qName, context.namespaceResolver, context.contextNode, false);

        if (parts[0] === null) {
            throw new Error("Cannot resolve QName " + name);
        }

        return context.functionResolver.getFunction(parts[1], parts[0]);
    };

    FunctionResolver.prototype.getFunction = function (localName, namespace) {
        return this.functions["{" + namespace + "}" + localName];
    };

// NamespaceResolver /////////////////////////////////////////////////////////

    NamespaceResolver.prototype = new Object();
    NamespaceResolver.prototype.constructor = NamespaceResolver;
    NamespaceResolver.superclass = Object.prototype;

    function NamespaceResolver() {
    }

    NamespaceResolver.prototype.getNamespace = function (prefix, n) {
        if (prefix == "xml") {
            return XPath.XML_NAMESPACE_URI;
        } else if (prefix == "xmlns") {
            return XPath.XMLNS_NAMESPACE_URI;
        }
        if (n.nodeType == 9 /*Node.DOCUMENT_NODE*/) {
            n = n.documentElement;
        } else if (n.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
            n = PathExpr.getOwnerElement(n);
        } else if (n.nodeType != 1 /*Node.ELEMENT_NODE*/) {
            n = n.parentNode;
        }
        while (n != null && n.nodeType == 1 /*Node.ELEMENT_NODE*/) {
            var nnm = n.attributes;
            for (var i = 0; i < nnm.length; i++) {
                var a = nnm.item(i);
                var aname = a.name || a.nodeName;
                if ((aname === "xmlns" && prefix === "")
                    || aname === "xmlns:" + prefix) {
                    return String(a.value || a.nodeValue);
                }
            }
            n = n.parentNode;
        }
        return null;
    };

// Functions /////////////////////////////////////////////////////////////////

    var Functions = new Object();

    Functions.last = function (c) {
        if (arguments.length != 1) {
            throw new Error("Function last expects ()");
        }

        return new XNumber(c.contextSize);
    };

    Functions.position = function (c) {
        if (arguments.length != 1) {
            throw new Error("Function position expects ()");
        }

        return new XNumber(c.contextPosition);
    };

    Functions.count = function () {
        var c = arguments[0];
        var ns;
        if (arguments.length != 2 || !Utilities.instance_of(ns = arguments[1].evaluate(c), XNodeSet)) {
            throw new Error("Function count expects (node-set)");
        }
        return new XNumber(ns.size);
    };

    Functions.id = function () {
        var c = arguments[0];
        var id;
        if (arguments.length != 2) {
            throw new Error("Function id expects (object)");
        }
        id = arguments[1].evaluate(c);
        if (Utilities.instance_of(id, XNodeSet)) {
            id = id.toArray().join(" ");
        } else {
            id = id.stringValue();
        }
        var ids = id.split(/[\x0d\x0a\x09\x20]+/);
        var count = 0;
        var ns = new XNodeSet();
        var doc = c.contextNode.nodeType == 9 /*Node.DOCUMENT_NODE*/
            ? c.contextNode
            : c.contextNode.ownerDocument;
        for (var i = 0; i < ids.length; i++) {
            var n;
            if (doc.getElementById) {
                n = doc.getElementById(ids[i]);
            } else {
                n = Utilities.getElementById(doc, ids[i]);
            }
            if (n != null) {
                ns.add(n);
                count++;
            }
        }
        return ns;
    };

    Functions.localName = function (c, eNode) {
        var n;

        if (arguments.length == 1) {
            n = c.contextNode;
        } else if (arguments.length == 2) {
            n = eNode.evaluate(c).first();
        } else {
            throw new Error("Function local-name expects (node-set?)");
        }

        if (n == null) {
            return new XString("");
        }

        return new XString(n.localName ||     //  standard elements and attributes
            n.baseName ||     //  IE
            n.target ||     //  processing instructions
            n.nodeName ||     //  DOM1 elements
            "");               //  fallback
    };

    Functions.namespaceURI = function () {
        var c = arguments[0];
        var n;
        if (arguments.length == 1) {
            n = c.contextNode;
        } else if (arguments.length == 2) {
            n = arguments[1].evaluate(c).first();
        } else {
            throw new Error("Function namespace-uri expects (node-set?)");
        }
        if (n == null) {
            return new XString("");
        }
        return new XString(n.namespaceURI);
    };

    Functions.name = function () {
        var c = arguments[0];
        var n;
        if (arguments.length == 1) {
            n = c.contextNode;
        } else if (arguments.length == 2) {
            n = arguments[1].evaluate(c).first();
        } else {
            throw new Error("Function name expects (node-set?)");
        }
        if (n == null) {
            return new XString("");
        }
        if (n.nodeType == 1 /*Node.ELEMENT_NODE*/) {
            return new XString(n.nodeName);
        } else if (n.nodeType == 2 /*Node.ATTRIBUTE_NODE*/) {
            return new XString(n.name || n.nodeName);
        } else if (n.nodeType === 7 /*Node.PROCESSING_INSTRUCTION_NODE*/) {
            return new XString(n.target || n.nodeName);
        } else if (n.localName == null) {
            return new XString("");
        } else {
            return new XString(n.localName);
        }
    };

    Functions.string = function () {
        var c = arguments[0];
        if (arguments.length == 1) {
            return new XString(XNodeSet.prototype.stringForNode(c.contextNode));
        } else if (arguments.length == 2) {
            return arguments[1].evaluate(c).string();
        }
        throw new Error("Function string expects (object?)");
    };

    Functions.concat = function (c) {
        if (arguments.length < 3) {
            throw new Error("Function concat expects (string, string[, string]*)");
        }
        var s = "";
        for (var i = 1; i < arguments.length; i++) {
            s += arguments[i].evaluate(c).stringValue();
        }
        return new XString(s);
    };

    Functions.startsWith = function () {
        var c = arguments[0];
        if (arguments.length != 3) {
            throw new Error("Function startsWith expects (string, string)");
        }
        var s1 = arguments[1].evaluate(c).stringValue();
        var s2 = arguments[2].evaluate(c).stringValue();
        return new XBoolean(s1.substring(0, s2.length) == s2);
    };

    Functions.contains = function () {
        var c = arguments[0];
        if (arguments.length != 3) {
            throw new Error("Function contains expects (string, string)");
        }
        var s1 = arguments[1].evaluate(c).stringValue();
        var s2 = arguments[2].evaluate(c).stringValue();
        return new XBoolean(s1.indexOf(s2) !== -1);
    };

    Functions.substringBefore = function () {
        var c = arguments[0];
        if (arguments.length != 3) {
            throw new Error("Function substring-before expects (string, string)");
        }
        var s1 = arguments[1].evaluate(c).stringValue();
        var s2 = arguments[2].evaluate(c).stringValue();
        return new XString(s1.substring(0, s1.indexOf(s2)));
    };

    Functions.substringAfter = function () {
        var c = arguments[0];
        if (arguments.length != 3) {
            throw new Error("Function substring-after expects (string, string)");
        }
        var s1 = arguments[1].evaluate(c).stringValue();
        var s2 = arguments[2].evaluate(c).stringValue();
        if (s2.length == 0) {
            return new XString(s1);
        }
        var i = s1.indexOf(s2);
        if (i == -1) {
            return new XString("");
        }
        return new XString(s1.substring(i + s2.length));
    };

    Functions.substring = function () {
        var c = arguments[0];
        if (!(arguments.length == 3 || arguments.length == 4)) {
            throw new Error("Function substring expects (string, number, number?)");
        }
        var s = arguments[1].evaluate(c).stringValue();
        var n1 = Math.round(arguments[2].evaluate(c).numberValue()) - 1;
        var n2 = arguments.length == 4 ? n1 + Math.round(arguments[3].evaluate(c).numberValue()) : undefined;
        return new XString(s.substring(n1, n2));
    };

    Functions.stringLength = function () {
        var c = arguments[0];
        var s;
        if (arguments.length == 1) {
            s = XNodeSet.prototype.stringForNode(c.contextNode);
        } else if (arguments.length == 2) {
            s = arguments[1].evaluate(c).stringValue();
        } else {
            throw new Error("Function string-length expects (string?)");
        }
        return new XNumber(s.length);
    };

    Functions.normalizeSpace = function () {
        var c = arguments[0];
        var s;
        if (arguments.length == 1) {
            s = XNodeSet.prototype.stringForNode(c.contextNode);
        } else if (arguments.length == 2) {
            s = arguments[1].evaluate(c).stringValue();
        } else {
            throw new Error("Function normalize-space expects (string?)");
        }
        var i = 0;
        var j = s.length - 1;
        while (Utilities.isSpace(s.charCodeAt(j))) {
            j--;
        }
        var t = "";
        while (i <= j && Utilities.isSpace(s.charCodeAt(i))) {
            i++;
        }
        while (i <= j) {
            if (Utilities.isSpace(s.charCodeAt(i))) {
                t += " ";
                while (i <= j && Utilities.isSpace(s.charCodeAt(i))) {
                    i++;
                }
            } else {
                t += s.charAt(i);
                i++;
            }
        }
        return new XString(t);
    };

    Functions.translate = function (c, eValue, eFrom, eTo) {
        if (arguments.length != 4) {
            throw new Error("Function translate expects (string, string, string)");
        }

        var value = eValue.evaluate(c).stringValue();
        var from = eFrom.evaluate(c).stringValue();
        var to = eTo.evaluate(c).stringValue();

        var cMap = reduce(function (acc, ch, i) {
            if (!(ch in acc)) {
                acc[ch] = i > to.length ? '' : to[i];
            }
            return acc;
        }, {}, from);

        var t = join('', map(function (ch) {
            return ch in cMap ? cMap[ch] : ch;
        }, value));

        return new XString(t);
    };

    Functions.boolean_ = function () {
        var c = arguments[0];
        if (arguments.length != 2) {
            throw new Error("Function boolean expects (object)");
        }
        return arguments[1].evaluate(c).bool();
    };

    Functions.not = function (c, eValue) {
        if (arguments.length != 2) {
            throw new Error("Function not expects (object)");
        }
        return eValue.evaluate(c).bool().not();
    };

    Functions.true_ = function () {
        if (arguments.length != 1) {
            throw new Error("Function true expects ()");
        }
        return XBoolean.true_;
    };

    Functions.false_ = function () {
        if (arguments.length != 1) {
            throw new Error("Function false expects ()");
        }
        return XBoolean.false_;
    };

    Functions.lang = function () {
        var c = arguments[0];
        if (arguments.length != 2) {
            throw new Error("Function lang expects (string)");
        }
        var lang;
        for (var n = c.contextNode; n != null && n.nodeType != 9 /*Node.DOCUMENT_NODE*/; n = n.parentNode) {
            var a = n.getAttributeNS(XPath.XML_NAMESPACE_URI, "lang");
            if (a != null) {
                lang = String(a);
                break;
            }
        }
        if (lang == null) {
            return XBoolean.false_;
        }
        var s = arguments[1].evaluate(c).stringValue();
        return new XBoolean(lang.substring(0, s.length) == s
            && (lang.length == s.length || lang.charAt(s.length) == '-'));
    };

    Functions.number = function () {
        var c = arguments[0];
        if (!(arguments.length == 1 || arguments.length == 2)) {
            throw new Error("Function number expects (object?)");
        }
        if (arguments.length == 1) {
            return new XNumber(XNodeSet.prototype.stringForNode(c.contextNode));
        }
        return arguments[1].evaluate(c).number();
    };

    Functions.sum = function () {
        var c = arguments[0];
        var ns;
        if (arguments.length != 2 || !Utilities.instance_of((ns = arguments[1].evaluate(c)), XNodeSet)) {
            throw new Error("Function sum expects (node-set)");
        }
        ns = ns.toUnsortedArray();
        var n = 0;
        for (var i = 0; i < ns.length; i++) {
            n += new XNumber(XNodeSet.prototype.stringForNode(ns[i])).numberValue();
        }
        return new XNumber(n);
    };

    Functions.floor = function () {
        var c = arguments[0];
        if (arguments.length != 2) {
            throw new Error("Function floor expects (number)");
        }
        return new XNumber(Math.floor(arguments[1].evaluate(c).numberValue()));
    };

    Functions.ceiling = function () {
        var c = arguments[0];
        if (arguments.length != 2) {
            throw new Error("Function ceiling expects (number)");
        }
        return new XNumber(Math.ceil(arguments[1].evaluate(c).numberValue()));
    };

    Functions.round = function () {
        var c = arguments[0];
        if (arguments.length != 2) {
            throw new Error("Function round expects (number)");
        }
        return new XNumber(Math.round(arguments[1].evaluate(c).numberValue()));
    };

// Utilities /////////////////////////////////////////////////////////////////

    var Utilities = new Object();

    Utilities.isAttribute = function (val) {
        return val && (val.nodeType === 2 || val.ownerElement);
    }

    Utilities.splitQName = function (qn) {
        var i = qn.indexOf(":");
        if (i == -1) {
            return [null, qn];
        }
        return [qn.substring(0, i), qn.substring(i + 1)];
    };

    Utilities.resolveQName = function (qn, nr, n, useDefault) {
        var parts = Utilities.splitQName(qn);
        if (parts[0] != null) {
            parts[0] = nr.getNamespace(parts[0], n);
        } else {
            if (useDefault) {
                parts[0] = nr.getNamespace("", n);
                if (parts[0] == null) {
                    parts[0] = "";
                }
            } else {
                parts[0] = "";
            }
        }
        return parts;
    };

    Utilities.isSpace = function (c) {
        return c == 0x9 || c == 0xd || c == 0xa || c == 0x20;
    };

    Utilities.isLetter = function (c) {
        return c >= 0x0041 && c <= 0x005A ||
            c >= 0x0061 && c <= 0x007A ||
            c >= 0x00C0 && c <= 0x00D6 ||
            c >= 0x00D8 && c <= 0x00F6 ||
            c >= 0x00F8 && c <= 0x00FF ||
            c >= 0x0100 && c <= 0x0131 ||
            c >= 0x0134 && c <= 0x013E ||
            c >= 0x0141 && c <= 0x0148 ||
            c >= 0x014A && c <= 0x017E ||
            c >= 0x0180 && c <= 0x01C3 ||
            c >= 0x01CD && c <= 0x01F0 ||
            c >= 0x01F4 && c <= 0x01F5 ||
            c >= 0x01FA && c <= 0x0217 ||
            c >= 0x0250 && c <= 0x02A8 ||
            c >= 0x02BB && c <= 0x02C1 ||
            c == 0x0386 ||
            c >= 0x0388 && c <= 0x038A ||
            c == 0x038C ||
            c >= 0x038E && c <= 0x03A1 ||
            c >= 0x03A3 && c <= 0x03CE ||
            c >= 0x03D0 && c <= 0x03D6 ||
            c == 0x03DA ||
            c == 0x03DC ||
            c == 0x03DE ||
            c == 0x03E0 ||
            c >= 0x03E2 && c <= 0x03F3 ||
            c >= 0x0401 && c <= 0x040C ||
            c >= 0x040E && c <= 0x044F ||
            c >= 0x0451 && c <= 0x045C ||
            c >= 0x045E && c <= 0x0481 ||
            c >= 0x0490 && c <= 0x04C4 ||
            c >= 0x04C7 && c <= 0x04C8 ||
            c >= 0x04CB && c <= 0x04CC ||
            c >= 0x04D0 && c <= 0x04EB ||
            c >= 0x04EE && c <= 0x04F5 ||
            c >= 0x04F8 && c <= 0x04F9 ||
            c >= 0x0531 && c <= 0x0556 ||
            c == 0x0559 ||
            c >= 0x0561 && c <= 0x0586 ||
            c >= 0x05D0 && c <= 0x05EA ||
            c >= 0x05F0 && c <= 0x05F2 ||
            c >= 0x0621 && c <= 0x063A ||
            c >= 0x0641 && c <= 0x064A ||
            c >= 0x0671 && c <= 0x06B7 ||
            c >= 0x06BA && c <= 0x06BE ||
            c >= 0x06C0 && c <= 0x06CE ||
            c >= 0x06D0 && c <= 0x06D3 ||
            c == 0x06D5 ||
            c >= 0x06E5 && c <= 0x06E6 ||
            c >= 0x0905 && c <= 0x0939 ||
            c == 0x093D ||
            c >= 0x0958 && c <= 0x0961 ||
            c >= 0x0985 && c <= 0x098C ||
            c >= 0x098F && c <= 0x0990 ||
            c >= 0x0993 && c <= 0x09A8 ||
            c >= 0x09AA && c <= 0x09B0 ||
            c == 0x09B2 ||
            c >= 0x09B6 && c <= 0x09B9 ||
            c >= 0x09DC && c <= 0x09DD ||
            c >= 0x09DF && c <= 0x09E1 ||
            c >= 0x09F0 && c <= 0x09F1 ||
            c >= 0x0A05 && c <= 0x0A0A ||
            c >= 0x0A0F && c <= 0x0A10 ||
            c >= 0x0A13 && c <= 0x0A28 ||
            c >= 0x0A2A && c <= 0x0A30 ||
            c >= 0x0A32 && c <= 0x0A33 ||
            c >= 0x0A35 && c <= 0x0A36 ||
            c >= 0x0A38 && c <= 0x0A39 ||
            c >= 0x0A59 && c <= 0x0A5C ||
            c == 0x0A5E ||
            c >= 0x0A72 && c <= 0x0A74 ||
            c >= 0x0A85 && c <= 0x0A8B ||
            c == 0x0A8D ||
            c >= 0x0A8F && c <= 0x0A91 ||
            c >= 0x0A93 && c <= 0x0AA8 ||
            c >= 0x0AAA && c <= 0x0AB0 ||
            c >= 0x0AB2 && c <= 0x0AB3 ||
            c >= 0x0AB5 && c <= 0x0AB9 ||
            c == 0x0ABD ||
            c == 0x0AE0 ||
            c >= 0x0B05 && c <= 0x0B0C ||
            c >= 0x0B0F && c <= 0x0B10 ||
            c >= 0x0B13 && c <= 0x0B28 ||
            c >= 0x0B2A && c <= 0x0B30 ||
            c >= 0x0B32 && c <= 0x0B33 ||
            c >= 0x0B36 && c <= 0x0B39 ||
            c == 0x0B3D ||
            c >= 0x0B5C && c <= 0x0B5D ||
            c >= 0x0B5F && c <= 0x0B61 ||
            c >= 0x0B85 && c <= 0x0B8A ||
            c >= 0x0B8E && c <= 0x0B90 ||
            c >= 0x0B92 && c <= 0x0B95 ||
            c >= 0x0B99 && c <= 0x0B9A ||
            c == 0x0B9C ||
            c >= 0x0B9E && c <= 0x0B9F ||
            c >= 0x0BA3 && c <= 0x0BA4 ||
            c >= 0x0BA8 && c <= 0x0BAA ||
            c >= 0x0BAE && c <= 0x0BB5 ||
            c >= 0x0BB7 && c <= 0x0BB9 ||
            c >= 0x0C05 && c <= 0x0C0C ||
            c >= 0x0C0E && c <= 0x0C10 ||
            c >= 0x0C12 && c <= 0x0C28 ||
            c >= 0x0C2A && c <= 0x0C33 ||
            c >= 0x0C35 && c <= 0x0C39 ||
            c >= 0x0C60 && c <= 0x0C61 ||
            c >= 0x0C85 && c <= 0x0C8C ||
            c >= 0x0C8E && c <= 0x0C90 ||
            c >= 0x0C92 && c <= 0x0CA8 ||
            c >= 0x0CAA && c <= 0x0CB3 ||
            c >= 0x0CB5 && c <= 0x0CB9 ||
            c == 0x0CDE ||
            c >= 0x0CE0 && c <= 0x0CE1 ||
            c >= 0x0D05 && c <= 0x0D0C ||
            c >= 0x0D0E && c <= 0x0D10 ||
            c >= 0x0D12 && c <= 0x0D28 ||
            c >= 0x0D2A && c <= 0x0D39 ||
            c >= 0x0D60 && c <= 0x0D61 ||
            c >= 0x0E01 && c <= 0x0E2E ||
            c == 0x0E30 ||
            c >= 0x0E32 && c <= 0x0E33 ||
            c >= 0x0E40 && c <= 0x0E45 ||
            c >= 0x0E81 && c <= 0x0E82 ||
            c == 0x0E84 ||
            c >= 0x0E87 && c <= 0x0E88 ||
            c == 0x0E8A ||
            c == 0x0E8D ||
            c >= 0x0E94 && c <= 0x0E97 ||
            c >= 0x0E99 && c <= 0x0E9F ||
            c >= 0x0EA1 && c <= 0x0EA3 ||
            c == 0x0EA5 ||
            c == 0x0EA7 ||
            c >= 0x0EAA && c <= 0x0EAB ||
            c >= 0x0EAD && c <= 0x0EAE ||
            c == 0x0EB0 ||
            c >= 0x0EB2 && c <= 0x0EB3 ||
            c == 0x0EBD ||
            c >= 0x0EC0 && c <= 0x0EC4 ||
            c >= 0x0F40 && c <= 0x0F47 ||
            c >= 0x0F49 && c <= 0x0F69 ||
            c >= 0x10A0 && c <= 0x10C5 ||
            c >= 0x10D0 && c <= 0x10F6 ||
            c == 0x1100 ||
            c >= 0x1102 && c <= 0x1103 ||
            c >= 0x1105 && c <= 0x1107 ||
            c == 0x1109 ||
            c >= 0x110B && c <= 0x110C ||
            c >= 0x110E && c <= 0x1112 ||
            c == 0x113C ||
            c == 0x113E ||
            c == 0x1140 ||
            c == 0x114C ||
            c == 0x114E ||
            c == 0x1150 ||
            c >= 0x1154 && c <= 0x1155 ||
            c == 0x1159 ||
            c >= 0x115F && c <= 0x1161 ||
            c == 0x1163 ||
            c == 0x1165 ||
            c == 0x1167 ||
            c == 0x1169 ||
            c >= 0x116D && c <= 0x116E ||
            c >= 0x1172 && c <= 0x1173 ||
            c == 0x1175 ||
            c == 0x119E ||
            c == 0x11A8 ||
            c == 0x11AB ||
            c >= 0x11AE && c <= 0x11AF ||
            c >= 0x11B7 && c <= 0x11B8 ||
            c == 0x11BA ||
            c >= 0x11BC && c <= 0x11C2 ||
            c == 0x11EB ||
            c == 0x11F0 ||
            c == 0x11F9 ||
            c >= 0x1E00 && c <= 0x1E9B ||
            c >= 0x1EA0 && c <= 0x1EF9 ||
            c >= 0x1F00 && c <= 0x1F15 ||
            c >= 0x1F18 && c <= 0x1F1D ||
            c >= 0x1F20 && c <= 0x1F45 ||
            c >= 0x1F48 && c <= 0x1F4D ||
            c >= 0x1F50 && c <= 0x1F57 ||
            c == 0x1F59 ||
            c == 0x1F5B ||
            c == 0x1F5D ||
            c >= 0x1F5F && c <= 0x1F7D ||
            c >= 0x1F80 && c <= 0x1FB4 ||
            c >= 0x1FB6 && c <= 0x1FBC ||
            c == 0x1FBE ||
            c >= 0x1FC2 && c <= 0x1FC4 ||
            c >= 0x1FC6 && c <= 0x1FCC ||
            c >= 0x1FD0 && c <= 0x1FD3 ||
            c >= 0x1FD6 && c <= 0x1FDB ||
            c >= 0x1FE0 && c <= 0x1FEC ||
            c >= 0x1FF2 && c <= 0x1FF4 ||
            c >= 0x1FF6 && c <= 0x1FFC ||
            c == 0x2126 ||
            c >= 0x212A && c <= 0x212B ||
            c == 0x212E ||
            c >= 0x2180 && c <= 0x2182 ||
            c >= 0x3041 && c <= 0x3094 ||
            c >= 0x30A1 && c <= 0x30FA ||
            c >= 0x3105 && c <= 0x312C ||
            c >= 0xAC00 && c <= 0xD7A3 ||
            c >= 0x4E00 && c <= 0x9FA5 ||
            c == 0x3007 ||
            c >= 0x3021 && c <= 0x3029;
    };

    Utilities.isNCNameChar = function (c) {
        return c >= 0x0030 && c <= 0x0039
            || c >= 0x0660 && c <= 0x0669
            || c >= 0x06F0 && c <= 0x06F9
            || c >= 0x0966 && c <= 0x096F
            || c >= 0x09E6 && c <= 0x09EF
            || c >= 0x0A66 && c <= 0x0A6F
            || c >= 0x0AE6 && c <= 0x0AEF
            || c >= 0x0B66 && c <= 0x0B6F
            || c >= 0x0BE7 && c <= 0x0BEF
            || c >= 0x0C66 && c <= 0x0C6F
            || c >= 0x0CE6 && c <= 0x0CEF
            || c >= 0x0D66 && c <= 0x0D6F
            || c >= 0x0E50 && c <= 0x0E59
            || c >= 0x0ED0 && c <= 0x0ED9
            || c >= 0x0F20 && c <= 0x0F29
            || c == 0x002E
            || c == 0x002D
            || c == 0x005F
            || Utilities.isLetter(c)
            || c >= 0x0300 && c <= 0x0345
            || c >= 0x0360 && c <= 0x0361
            || c >= 0x0483 && c <= 0x0486
            || c >= 0x0591 && c <= 0x05A1
            || c >= 0x05A3 && c <= 0x05B9
            || c >= 0x05BB && c <= 0x05BD
            || c == 0x05BF
            || c >= 0x05C1 && c <= 0x05C2
            || c == 0x05C4
            || c >= 0x064B && c <= 0x0652
            || c == 0x0670
            || c >= 0x06D6 && c <= 0x06DC
            || c >= 0x06DD && c <= 0x06DF
            || c >= 0x06E0 && c <= 0x06E4
            || c >= 0x06E7 && c <= 0x06E8
            || c >= 0x06EA && c <= 0x06ED
            || c >= 0x0901 && c <= 0x0903
            || c == 0x093C
            || c >= 0x093E && c <= 0x094C
            || c == 0x094D
            || c >= 0x0951 && c <= 0x0954
            || c >= 0x0962 && c <= 0x0963
            || c >= 0x0981 && c <= 0x0983
            || c == 0x09BC
            || c == 0x09BE
            || c == 0x09BF
            || c >= 0x09C0 && c <= 0x09C4
            || c >= 0x09C7 && c <= 0x09C8
            || c >= 0x09CB && c <= 0x09CD
            || c == 0x09D7
            || c >= 0x09E2 && c <= 0x09E3
            || c == 0x0A02
            || c == 0x0A3C
            || c == 0x0A3E
            || c == 0x0A3F
            || c >= 0x0A40 && c <= 0x0A42
            || c >= 0x0A47 && c <= 0x0A48
            || c >= 0x0A4B && c <= 0x0A4D
            || c >= 0x0A70 && c <= 0x0A71
            || c >= 0x0A81 && c <= 0x0A83
            || c == 0x0ABC
            || c >= 0x0ABE && c <= 0x0AC5
            || c >= 0x0AC7 && c <= 0x0AC9
            || c >= 0x0ACB && c <= 0x0ACD
            || c >= 0x0B01 && c <= 0x0B03
            || c == 0x0B3C
            || c >= 0x0B3E && c <= 0x0B43
            || c >= 0x0B47 && c <= 0x0B48
            || c >= 0x0B4B && c <= 0x0B4D
            || c >= 0x0B56 && c <= 0x0B57
            || c >= 0x0B82 && c <= 0x0B83
            || c >= 0x0BBE && c <= 0x0BC2
            || c >= 0x0BC6 && c <= 0x0BC8
            || c >= 0x0BCA && c <= 0x0BCD
            || c == 0x0BD7
            || c >= 0x0C01 && c <= 0x0C03
            || c >= 0x0C3E && c <= 0x0C44
            || c >= 0x0C46 && c <= 0x0C48
            || c >= 0x0C4A && c <= 0x0C4D
            || c >= 0x0C55 && c <= 0x0C56
            || c >= 0x0C82 && c <= 0x0C83
            || c >= 0x0CBE && c <= 0x0CC4
            || c >= 0x0CC6 && c <= 0x0CC8
            || c >= 0x0CCA && c <= 0x0CCD
            || c >= 0x0CD5 && c <= 0x0CD6
            || c >= 0x0D02 && c <= 0x0D03
            || c >= 0x0D3E && c <= 0x0D43
            || c >= 0x0D46 && c <= 0x0D48
            || c >= 0x0D4A && c <= 0x0D4D
            || c == 0x0D57
            || c == 0x0E31
            || c >= 0x0E34 && c <= 0x0E3A
            || c >= 0x0E47 && c <= 0x0E4E
            || c == 0x0EB1
            || c >= 0x0EB4 && c <= 0x0EB9
            || c >= 0x0EBB && c <= 0x0EBC
            || c >= 0x0EC8 && c <= 0x0ECD
            || c >= 0x0F18 && c <= 0x0F19
            || c == 0x0F35
            || c == 0x0F37
            || c == 0x0F39
            || c == 0x0F3E
            || c == 0x0F3F
            || c >= 0x0F71 && c <= 0x0F84
            || c >= 0x0F86 && c <= 0x0F8B
            || c >= 0x0F90 && c <= 0x0F95
            || c == 0x0F97
            || c >= 0x0F99 && c <= 0x0FAD
            || c >= 0x0FB1 && c <= 0x0FB7
            || c == 0x0FB9
            || c >= 0x20D0 && c <= 0x20DC
            || c == 0x20E1
            || c >= 0x302A && c <= 0x302F
            || c == 0x3099
            || c == 0x309A
            || c == 0x00B7
            || c == 0x02D0
            || c == 0x02D1
            || c == 0x0387
            || c == 0x0640
            || c == 0x0E46
            || c == 0x0EC6
            || c == 0x3005
            || c >= 0x3031 && c <= 0x3035
            || c >= 0x309D && c <= 0x309E
            || c >= 0x30FC && c <= 0x30FE;
    };

    Utilities.coalesceText = function (n) {
        for (var m = n.firstChild; m != null; m = m.nextSibling) {
            if (m.nodeType == 3 /*Node.TEXT_NODE*/ || m.nodeType == 4 /*Node.CDATA_SECTION_NODE*/) {
                var s = m.nodeValue;
                var first = m;
                m = m.nextSibling;
                while (m != null && (m.nodeType == 3 /*Node.TEXT_NODE*/ || m.nodeType == 4 /*Node.CDATA_SECTION_NODE*/)) {
                    s += m.nodeValue;
                    var del = m;
                    m = m.nextSibling;
                    del.parentNode.removeChild(del);
                }
                if (first.nodeType == 4 /*Node.CDATA_SECTION_NODE*/) {
                    var p = first.parentNode;
                    if (first.nextSibling == null) {
                        p.removeChild(first);
                        p.appendChild(p.ownerDocument.createTextNode(s));
                    } else {
                        var next = first.nextSibling;
                        p.removeChild(first);
                        p.insertBefore(p.ownerDocument.createTextNode(s), next);
                    }
                } else {
                    first.nodeValue = s;
                }
                if (m == null) {
                    break;
                }
            } else if (m.nodeType == 1 /*Node.ELEMENT_NODE*/) {
                Utilities.coalesceText(m);
            }
        }
    };

    Utilities.instance_of = function (o, c) {
        while (o != null) {
            if (o.constructor === c) {
                return true;
            }
            if (o === Object) {
                return false;
            }
            o = o.constructor.superclass;
        }
        return false;
    };

    Utilities.getElementById = function (n, id) {
        // Note that this does not check the DTD to check for actual
        // attributes of type ID, so this may be a bit wrong.
        if (n.nodeType == 1 /*Node.ELEMENT_NODE*/) {
            if (n.getAttribute("id") == id
                || n.getAttributeNS(null, "id") == id) {
                return n;
            }
        }
        for (var m = n.firstChild; m != null; m = m.nextSibling) {
            var res = Utilities.getElementById(m, id);
            if (res != null) {
                return res;
            }
        }
        return null;
    };

// XPathException ////////////////////////////////////////////////////////////

    var XPathException = (function () {
        function getMessage(code, exception) {
            var msg = exception ? ": " + exception.toString() : "";
            switch (code) {
                case XPathException.INVALID_EXPRESSION_ERR:
                    return "Invalid expression" + msg;
                case XPathException.TYPE_ERR:
                    return "Type error" + msg;
            }
            return null;
        }

        function XPathException(code, error, message) {
            var err = Error.call(this, getMessage(code, error) || message);

            err.code = code;
            err.exception = error;

            return err;
        }

        XPathException.prototype = Object.create(Error.prototype);
        XPathException.prototype.constructor = XPathException;
        XPathException.superclass = Error;

        XPathException.prototype.toString = function () {
            return this.message;
        };

        XPathException.fromMessage = function (message, error) {
            return new XPathException(null, error, message);
        };

        XPathException.INVALID_EXPRESSION_ERR = 51;
        XPathException.TYPE_ERR = 52;

        return XPathException;
    })();

// XPathExpression ///////////////////////////////////////////////////////////

    XPathExpression.prototype = {};
    XPathExpression.prototype.constructor = XPathExpression;
    XPathExpression.superclass = Object.prototype;

    function XPathExpression(e, r, p) {
        this.xpath = p.parse(e);
        this.context = new XPathContext();
        this.context.namespaceResolver = new XPathNSResolverWrapper(r);
    }

    XPathExpression.getOwnerDocument = function (n) {
        return n.nodeType === 9 /*Node.DOCUMENT_NODE*/ ? n : n.ownerDocument;
    }

    XPathExpression.detectHtmlDom = function (n) {
        if (!n) {
            return false;
        }

        var doc = XPathExpression.getOwnerDocument(n);

        try {
            return doc.implementation.hasFeature("HTML", "2.0");
        } catch (e) {
            return true;
        }
    }

    XPathExpression.prototype.evaluate = function (n, t, res) {
        this.context.expressionContextNode = n;
        // backward compatibility - no reliable way to detect whether the DOM is HTML, but
        // this library has been using this method up until now, so we will continue to use it
        // ONLY when using an XPathExpression
        this.context.caseInsensitive = XPathExpression.detectHtmlDom(n);

        var result = this.xpath.evaluate(this.context);
        return new XPathResult(result, t);
    }

// XPathNSResolverWrapper ////////////////////////////////////////////////////

    XPathNSResolverWrapper.prototype = {};
    XPathNSResolverWrapper.prototype.constructor = XPathNSResolverWrapper;
    XPathNSResolverWrapper.superclass = Object.prototype;

    function XPathNSResolverWrapper(r) {
        this.xpathNSResolver = r;
    }

    XPathNSResolverWrapper.prototype.getNamespace = function (prefix, n) {
        if (this.xpathNSResolver == null) {
            return null;
        }
        return this.xpathNSResolver.lookupNamespaceURI(prefix);
    };

// NodeXPathNSResolver ///////////////////////////////////////////////////////

    NodeXPathNSResolver.prototype = {};
    NodeXPathNSResolver.prototype.constructor = NodeXPathNSResolver;
    NodeXPathNSResolver.superclass = Object.prototype;

    function NodeXPathNSResolver(n) {
        this.node = n;
        this.namespaceResolver = new NamespaceResolver();
    }

    NodeXPathNSResolver.prototype.lookupNamespaceURI = function (prefix) {
        return this.namespaceResolver.getNamespace(prefix, this.node);
    };

// XPathResult ///////////////////////////////////////////////////////////////

    XPathResult.prototype = {};
    XPathResult.prototype.constructor = XPathResult;
    XPathResult.superclass = Object.prototype;

    function XPathResult(v, t) {
        if (t == XPathResult.ANY_TYPE) {
            if (v.constructor === XString) {
                t = XPathResult.STRING_TYPE;
            } else if (v.constructor === XNumber) {
                t = XPathResult.NUMBER_TYPE;
            } else if (v.constructor === XBoolean) {
                t = XPathResult.BOOLEAN_TYPE;
            } else if (v.constructor === XNodeSet) {
                t = XPathResult.UNORDERED_NODE_ITERATOR_TYPE;
            }
        }
        this.resultType = t;
        switch (t) {
            case XPathResult.NUMBER_TYPE:
                this.numberValue = v.numberValue();
                return;
            case XPathResult.STRING_TYPE:
                this.stringValue = v.stringValue();
                return;
            case XPathResult.BOOLEAN_TYPE:
                this.booleanValue = v.booleanValue();
                return;
            case XPathResult.ANY_UNORDERED_NODE_TYPE:
            case XPathResult.FIRST_ORDERED_NODE_TYPE:
                if (v.constructor === XNodeSet) {
                    this.singleNodeValue = v.first();
                    return;
                }
                break;
            case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
            case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
                if (v.constructor === XNodeSet) {
                    this.invalidIteratorState = false;
                    this.nodes = v.toArray();
                    this.iteratorIndex = 0;
                    return;
                }
                break;
            case XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE:
            case XPathResult.ORDERED_NODE_SNAPSHOT_TYPE:
                if (v.constructor === XNodeSet) {
                    this.nodes = v.toArray();
                    this.snapshotLength = this.nodes.length;
                    return;
                }
                break;
        }
        throw new XPathException(XPathException.TYPE_ERR);
    };

    XPathResult.prototype.iterateNext = function () {
        if (this.resultType != XPathResult.UNORDERED_NODE_ITERATOR_TYPE
            && this.resultType != XPathResult.ORDERED_NODE_ITERATOR_TYPE) {
            throw new XPathException(XPathException.TYPE_ERR);
        }
        return this.nodes[this.iteratorIndex++];
    };

    XPathResult.prototype.snapshotItem = function (i) {
        if (this.resultType != XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE
            && this.resultType != XPathResult.ORDERED_NODE_SNAPSHOT_TYPE) {
            throw new XPathException(XPathException.TYPE_ERR);
        }
        return this.nodes[i];
    };

    XPathResult.ANY_TYPE = 0;
    XPathResult.NUMBER_TYPE = 1;
    XPathResult.STRING_TYPE = 2;
    XPathResult.BOOLEAN_TYPE = 3;
    XPathResult.UNORDERED_NODE_ITERATOR_TYPE = 4;
    XPathResult.ORDERED_NODE_ITERATOR_TYPE = 5;
    XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE = 6;
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE = 7;
    XPathResult.ANY_UNORDERED_NODE_TYPE = 8;
    XPathResult.FIRST_ORDERED_NODE_TYPE = 9;

// DOM 3 XPath support ///////////////////////////////////////////////////////

    function installDOM3XPathSupport(doc, p) {
        doc.createExpression = function (e, r) {
            try {
                return new XPathExpression(e, r, p);
            } catch (e) {
                throw new XPathException(XPathException.INVALID_EXPRESSION_ERR, e);
            }
        };
        doc.createNSResolver = function (n) {
            return new NodeXPathNSResolver(n);
        };
        doc.evaluate = function (e, cn, r, t, res) {
            if (t < 0 || t > 9) {
                throw {
                    code: 0, toString: function () {
                        return "Request type not supported";
                    }
                };
            }
            return doc.createExpression(e, r, p).evaluate(cn, t, res);
        };
    };

// ---------------------------------------------------------------------------

// Install DOM 3 XPath support for the current document.
    try {
        var shouldInstall = true;
        try {
            if (document.implementation
                && document.implementation.hasFeature
                && document.implementation.hasFeature("XPath", null)) {
                shouldInstall = false;
            }
        } catch (e) {
        }
        if (shouldInstall) {
            installDOM3XPathSupport(document, new XPathParser());
        }
    } catch (e) {
    }

// ---------------------------------------------------------------------------
// exports for node.js

    installDOM3XPathSupport(exports, new XPathParser());

    (function () {
        var parser = new XPathParser();

        var defaultNSResolver = new NamespaceResolver();
        var defaultFunctionResolver = new FunctionResolver();
        var defaultVariableResolver = new VariableResolver();

        function makeNSResolverFromFunction(func) {
            return {
                getNamespace: function (prefix, node) {
                    var ns = func(prefix, node);

                    return ns || defaultNSResolver.getNamespace(prefix, node);
                }
            };
        }

        function makeNSResolverFromObject(obj) {
            return makeNSResolverFromFunction(obj.getNamespace.bind(obj));
        }

        function makeNSResolverFromMap(map) {
            return makeNSResolverFromFunction(function (prefix) {
                return map[prefix];
            });
        }

        function makeNSResolver(resolver) {
            if (resolver && typeof resolver.getNamespace === "function") {
                return makeNSResolverFromObject(resolver);
            }

            if (typeof resolver === "function") {
                return makeNSResolverFromFunction(resolver);
            }

            // assume prefix -> uri mapping
            if (typeof resolver === "object") {
                return makeNSResolverFromMap(resolver);
            }

            return defaultNSResolver;
        }

        /** Converts native JavaScript types to their XPath library equivalent */
        function convertValue(value) {
            if (value === null ||
                typeof value === "undefined" ||
                value instanceof XString ||
                value instanceof XBoolean ||
                value instanceof XNumber ||
                value instanceof XNodeSet) {
                return value;
            }

            switch (typeof value) {
                case "string":
                    return new XString(value);
                case "boolean":
                    return new XBoolean(value);
                case "number":
                    return new XNumber(value);
            }

            // assume node(s)
            var ns = new XNodeSet();
            ns.addArray([].concat(value));
            return ns;
        }

        function makeEvaluator(func) {
            return function (context) {
                var args = Array.prototype.slice.call(arguments, 1).map(function (arg) {
                    return arg.evaluate(context);
                });
                var result = func.apply(this, [].concat(context, args));
                return convertValue(result);
            };
        }

        function makeFunctionResolverFromFunction(func) {
            return {
                getFunction: function (name, namespace) {
                    var found = func(name, namespace);
                    if (found) {
                        return makeEvaluator(found);
                    }
                    return defaultFunctionResolver.getFunction(name, namespace);
                }
            };
        }

        function makeFunctionResolverFromObject(obj) {
            return makeFunctionResolverFromFunction(obj.getFunction.bind(obj));
        }

        function makeFunctionResolverFromMap(map) {
            return makeFunctionResolverFromFunction(function (name) {
                return map[name];
            });
        }

        function makeFunctionResolver(resolver) {
            if (resolver && typeof resolver.getFunction === "function") {
                return makeFunctionResolverFromObject(resolver);
            }

            if (typeof resolver === "function") {
                return makeFunctionResolverFromFunction(resolver);
            }

            // assume map
            if (typeof resolver === "object") {
                return makeFunctionResolverFromMap(resolver);
            }

            return defaultFunctionResolver;
        }

        function makeVariableResolverFromFunction(func) {
            return {
                getVariable: function (name, namespace) {
                    var value = func(name, namespace);
                    return convertValue(value);
                }
            };
        }

        function makeVariableResolver(resolver) {
            if (resolver) {
                if (typeof resolver.getVariable === "function") {
                    return makeVariableResolverFromFunction(resolver.getVariable.bind(resolver));
                }

                if (typeof resolver === "function") {
                    return makeVariableResolverFromFunction(resolver);
                }

                // assume map
                if (typeof resolver === "object") {
                    return makeVariableResolverFromFunction(function (name) {
                        return resolver[name];
                    });
                }
            }

            return defaultVariableResolver;
        }

        function copyIfPresent(prop, dest, source) {
            if (prop in source) {
                dest[prop] = source[prop];
            }
        }

        function makeContext(options) {
            var context = new XPathContext();

            if (options) {
                context.namespaceResolver = makeNSResolver(options.namespaces);
                context.functionResolver = makeFunctionResolver(options.functions);
                context.variableResolver = makeVariableResolver(options.variables);
                context.expressionContextNode = options.node;
                copyIfPresent('allowAnyNamespaceForNoPrefix', context, options);
                copyIfPresent('isHtml', context, options);
            } else {
                context.namespaceResolver = defaultNSResolver;
            }

            return context;
        }

        function evaluate(parsedExpression, options) {
            var context = makeContext(options);

            return parsedExpression.evaluate(context);
        }

        var evaluatorPrototype = {
            evaluate: function (options) {
                return evaluate(this.expression, options);
            }

            , evaluateNumber: function (options) {
                return this.evaluate(options).numberValue();
            }

            , evaluateString: function (options) {
                return this.evaluate(options).stringValue();
            }

            , evaluateBoolean: function (options) {
                return this.evaluate(options).booleanValue();
            }

            , evaluateNodeSet: function (options) {
                return this.evaluate(options).nodeset();
            }

            , select: function (options) {
                return this.evaluateNodeSet(options).toArray()
            }

            , select1: function (options) {
                return this.select(options)[0];
            }
        };

        function parse(xpath) {
            var parsed = parser.parse(xpath);

            return Object.create(evaluatorPrototype, {
                expression: {
                    value: parsed
                }
            });
        }

        exports.parse = parse;
    })();

    exports.XPath = XPath;
    exports.XPathParser = XPathParser;
    exports.XPathResult = XPathResult;

    exports.Step = Step;
    exports.NodeTest = NodeTest;
    exports.BarOperation = BarOperation;

    exports.NamespaceResolver = NamespaceResolver;
    exports.FunctionResolver = FunctionResolver;
    exports.VariableResolver = VariableResolver;

    exports.Utilities = Utilities;

    exports.XPathContext = XPathContext;
    exports.XNodeSet = XNodeSet;
    exports.XBoolean = XBoolean;
    exports.XString = XString;
    exports.XNumber = XNumber;

// helper
    exports.select = function (e, doc, single) {
        return exports.selectWithResolver(e, doc, null, single);
    };

    exports.useNamespaces = function (mappings) {
        var resolver = {
            mappings: mappings || {},
            lookupNamespaceURI: function (prefix) {
                return this.mappings[prefix];
            }
        };

        return function (e, doc, single) {
            return exports.selectWithResolver(e, doc, resolver, single);
        };
    };

    exports.selectWithResolver = function (e, doc, resolver, single) {
        var expression = new XPathExpression(e, resolver, new XPathParser());
        var type = XPathResult.ANY_TYPE;

        var result = expression.evaluate(doc, type, null);

        if (result.resultType == XPathResult.STRING_TYPE) {
            result = result.stringValue;
        }
        else if (result.resultType == XPathResult.NUMBER_TYPE) {
            result = result.numberValue;
        }
        else if (result.resultType == XPathResult.BOOLEAN_TYPE) {
            result = result.booleanValue;
        }
        else {
            result = result.nodes;
            if (single) {
                result = result[0];
            }
        }

        return result;
    };

    exports.select1 = function (e, doc) {
        return exports.select(e, doc, true);
    };

// end non-node wrapper
})(xpath);
(function e(t, n, r) {
    function s(o, u) {
        if (!n[o]) {
            if (!t[o]) {
                var a = typeof require == "function" && require;
                if (!u && a) return a(o, !0);
                if (i) return i(o, !0);
                var f = new Error("Cannot find module '" + o + "'");
                throw f.code = "MODULE_NOT_FOUND", f
            }
            var l = n[o] = {exports: {}};
            t[o][0].call(l.exports, function (e) {
                var n = t[o][1][e];
                return s(n ? n : e)
            }, l, l.exports, e, t, n, r)
        }
        return n[o].exports
    }

    var i = typeof require == "function" && require;
    for (var o = 0; o < r.length; o++) s(r[o]);
    return s
})({
    1: [function (require, module, exports) {
        var ExclusiveCanonicalisation = require("./lib/algorithm/exclusive-canonicalisation");

        var builtIn = {
            algorithms: {
                "http://www.w3.org/2001/10/xml-exc-c14n#": function (options) {
                    return new ExclusiveCanonicalisation(options);
                },
                "http://www.w3.org/2001/10/xml-exc-c14n#WithComments": function (options) {
                    options = Object.create(options || null);
                    options.includeComments = true;
                    return new ExclusiveCanonicalisation(options);
                },
            },
        };

        var CanonicalisationFactory = module.exports = function CanonicalisationFactory() {
            if (!(this instanceof CanonicalisationFactory)) {
                return new CanonicalisationFactory();
            }

            this.algorithms = Object.create(builtIn.algorithms);
        };

        CanonicalisationFactory.prototype.registerAlgorithm = function registerAlgorithm(uri, implementation) {
            this.algorithms[uri] = implementation;

            return this;
        };

        CanonicalisationFactory.prototype.getAlgorithm = function getAlgorithm(uri) {
            return this.algorithms[uri];
        };

        CanonicalisationFactory.prototype.createCanonicaliser = function createCanonicaliser(uri, options) {
            return this.algorithms[uri](options);
        };

    }, {"./lib/algorithm/exclusive-canonicalisation": 3}], 2: [function (require, module, exports) {
        var Algorithm = module.exports = function Algorithm(options) {
        };

        Algorithm.prototype.name = function name() {
            return null;
        };

        Algorithm.prototype.canonicalise = function canonicalise(node, cb) {
            setImmediate(function () {
                return cb(Error("not implemented"));
            });
        };

    }, {}], 3: [function (require, module, exports) {
        var escape = require("../escape");

        var Algorithm = require("../algorithm");

        var ExclusiveCanonicalisation = module.exports = function ExclusiveCanonicalisation(options) {
            Algorithm.call(this, options);

            options = options || {};

            this.includeComments = !!options.includeComments;
            this.inclusiveNamespaces = options.inclusiveNamespaces || [];
        };
        ExclusiveCanonicalisation.prototype = Object.create(Algorithm.prototype, {constructor: {value: ExclusiveCanonicalisation}});

        ExclusiveCanonicalisation.prototype.name = function name() {
            return "http://www.w3.org/2001/10/xml-exc-c14n#" + (this.includeComments ? "WithComments" : "");
        };

        ExclusiveCanonicalisation.prototype.canonicalise = function canonicalise(node, cb) {
            var self = this;

            // ensure asynchronicity
            setImmediate(function () {
                try {
                    var res = self._processInner(node);
                } catch (e) {
                    return cb(e);
                }

                return cb(null, res);
            });
        };

        ExclusiveCanonicalisation.prototype.getIncludeComments = function getIncludeComments() {
            return !!this.includeComments;
        };

        ExclusiveCanonicalisation.prototype.setIncludeComments = function setIncludeComments(includeComments) {
            this.includeComments = !!includeComments;
        };

        ExclusiveCanonicalisation.prototype.getInclusiveNamespaces = function getInclusiveNamespaces() {
            return this.inclusiveNamespaces.slice();
        };

        ExclusiveCanonicalisation.prototype.setInclusiveNamespaces = function setInclusiveNamespaces(inclusiveNamespaces) {
            this.inclusiveNamespaces = inclusiveNamespaces.slice();

            return this;
        };

        ExclusiveCanonicalisation.prototype.addInclusiveNamespace = function addInclusiveNamespace(inclusiveNamespace) {
            this.inclusiveNamespaces.push(inclusiveNamespace);

            return this;
        };

        var _compareAttributes = function _compareAttributes(a, b) {
            if (!a.prefix && b.prefix) {
                return -1;
            }

            if (!b.prefix && a.prefix) {
                return 1;
            }

            return a.name.localeCompare(b.name);
        };

        var _compareNamespaces = function _compareNamespaces(a, b) {
            var attr1 = a.prefix + a.namespaceURI,
                attr2 = b.prefix + b.namespaceURI;

            if (attr1 === attr2) {
                return 0;
            }

            return attr1.localeCompare(attr2);
        };

        ExclusiveCanonicalisation.prototype._renderAttributes = function _renderAttributes(node) {
            return (node.attributes ? [].slice.call(node.attributes) : []).filter(function (attribute) {
                return attribute.name.indexOf("xmlns") !== 0;
            }).sort(_compareAttributes).map(function (attribute) {
                return " " + attribute.name + "=\"" + escape.attributeEntities(attribute.value) + "\"";
            }).join("");
        };

        ExclusiveCanonicalisation.prototype._renderNamespace = function _renderNamespace(node, prefixesInScope, defaultNamespace) {
            var res = "",
                newDefaultNamespace = defaultNamespace,
                newPrefixesInScope = prefixesInScope.slice(),
                nsListToRender = [];

            var currentNamespace = node.namespaceURI || "";

            if (node.prefix) {
                var foundPrefix = newPrefixesInScope.filter(function (e) {
                    return e.prefix === node.prefix;
                }).shift();

                if (foundPrefix && foundPrefix.namespaceURI !== node.namespaceURI) {
                    for (var i = 0; i < newPrefixesInScope.length; ++i) {
                        if (newPrefixesInScope[i].prefix === node.prefix) {
                            newPrefixesInScope.splice(i--, 1);
                        }
                    }

                    foundPrefix = null;
                }

                if (!foundPrefix) {
                    nsListToRender.push({
                        prefix: node.prefix,
                        namespaceURI: node.namespaceURI,
                    });

                    newPrefixesInScope.push({
                        prefix: node.prefix,
                        namespaceURI: node.namespaceURI,
                    });
                }
            } else if (defaultNamespace !== currentNamespace) {
                newDefaultNamespace = currentNamespace;
                res += " xmlns=\"" + escape.attributeEntities(newDefaultNamespace) + "\"";
            }

            if (node.attributes) {
                for (var i = 0; i < node.attributes.length; i++) {
                    var attr = node.attributes[i],
                        foundPrefix = null;

                    if (attr.prefix && attr.prefix !== "xmlns") {
                        foundPrefix = newPrefixesInScope.filter(function (e) {
                            return e.prefix === attr.prefix;
                        }).shift();

                        if (foundPrefix && foundPrefix.namespaceURI !== attr.namespaceURI) {
                            for (var i = 0; i < newPrefixesInScope.length; ++i) {
                                if (newPrefixesInScope[i].prefix === attr.prefix) {
                                    newPrefixesInScope.splice(i--, 1);
                                }
                            }

                            foundPrefix = null;
                        }
                    }

                    if (attr.prefix && !foundPrefix && attr.prefix !== "xmlns") {
                        nsListToRender.push({
                            prefix: attr.prefix,
                            namespaceURI: attr.namespaceURI,
                        });

                        newPrefixesInScope.push({
                            prefix: attr.prefix,
                            namespaceURI: attr.namespaceURI,
                        });
                    } else if (attr.prefix && attr.prefix === "xmlns" && this.inclusiveNamespaces.indexOf(attr.localName) !== -1) {
                        nsListToRender.push({
                            prefix: attr.localName,
                            namespaceURI: attr.nodeValue,
                        });
                    }
                }
            }

            nsListToRender.sort(_compareNamespaces);

            for (var i = 0; i < nsListToRender.length; ++i) {
                res += " xmlns:" + nsListToRender[i].prefix + "=\"" + escape.attributeEntities(nsListToRender[i].namespaceURI) + "\"";
            }

            return {
                rendered: res,
                newDefaultNamespace: newDefaultNamespace,
                newPrefixesInScope: newPrefixesInScope,
            };
        };

        ExclusiveCanonicalisation.prototype._renderComment = function _renderComment(node) {
            var isOutsideDocument = (node.ownerDocument === node.parentNode),
                isBeforeDocument = null,
                isAfterDocument = null;

            if (isOutsideDocument) {
                var nextNode = node,
                    previousNode = node;

                while (nextNode !== null) {
                    if (nextNode === node.ownerDocument.documentElement) {
                        isBeforeDocument = true;
                        break;
                    }

                    nextNode = nextNode.nextSibling;
                }

                while (previousNode !== null) {
                    if (previousNode === node.ownerDocument.documentElement) {
                        isAfterDocument = true;
                        break;
                    }

                    previousNode = previousNode.previousSibling;
                }
            }

            return (isAfterDocument ? "\n" : "") + "<!--" + escape.textEntities(node.data) + "-->" + (isBeforeDocument ? "\n" : "");
        };

        ExclusiveCanonicalisation.prototype._renderProcessingInstruction = function _renderProcessingInstruction(node) {
            if (node.tagName === "xml") {
                return "";
            }

            var isOutsideDocument = (node.ownerDocument === node.parentNode),
                isBeforeDocument = null,
                isAfterDocument = null;

            if (isOutsideDocument) {
                var nextNode = node,
                    previousNode = node;

                while (nextNode !== null) {
                    if (nextNode === node.ownerDocument.documentElement) {
                        isBeforeDocument = true;
                        break;
                    }

                    nextNode = nextNode.nextSibling;
                }

                while (previousNode !== null) {
                    if (previousNode === node.ownerDocument.documentElement) {
                        isAfterDocument = true;
                        break;
                    }

                    previousNode = previousNode.previousSibling;
                }
            }

            return (isAfterDocument ? "\n" : "") + "<?" + node.tagName + (node.data ? " " + escape.textEntities(node.data) : "") + "?>" + (isBeforeDocument ? "\n" : "");
        };

        ExclusiveCanonicalisation.prototype._processInner = function _processInner(node, prefixesInScope, defaultNamespace) {
            defaultNamespace = defaultNamespace || "";
            prefixesInScope = prefixesInScope || [];

            if (node.nodeType === 3) {
                return (node.ownerDocument === node.parentNode) ? escape.textEntities(node.data.trim()) : escape.textEntities(node.data);
            }

            if (node.nodeType === 7) {
                return this._renderProcessingInstruction(node);
            }

            if (node.nodeType === 8) {
                return this.includeComments ? this._renderComment(node) : "";
            }

            if (node.nodeType === 10) {
                return "";
            }

            var ns = this._renderNamespace(node, prefixesInScope, defaultNamespace);

            var self = this;

            return [
                node.tagName ? "<" + node.tagName + ns.rendered + this._renderAttributes(node) + ">" : "",
                [].slice.call(node.childNodes).map(function (child) {
                    return self._processInner(child, ns.newPrefixesInScope, ns.newDefaultNamespace);
                }).join(""),
                node.tagName ? "</" + node.tagName + ">" : "",
            ].join("");
        };

    }, {"../algorithm": 2, "../escape": 4}], 4: [function (require, module, exports) {
        var entities = exports.entities = {
            "&": "&amp;",
            "\"": "&quot;",
            "<": "&lt;",
            ">": "&gt;",
            "\t": "&#x9;",
            "\n": "&#xA;",
            "\r": "&#xD;",
        };

        var attributeEntities = exports.attributeEntities = function escapeAttributeEntities(string) {
            return string.replace(/([\&<"\t\n\r])/g, function (character) {
                return entities[character];
            });
        };

        var textEntities = exports.textEntities = function escapeTextEntities(string) {
            return string.replace(/([\&<>\r])/g, function (character) {
                return entities[character];
            });
        };

    }, {}]
}, {}, [1]);
(function () {
    window.Helper = (function () {
        function Helper() {
        }


        /*
    Converts a base64 string into an arrayBuffer
    base64: base64 encoded input string
     */

        Helper.base64ToArrayBuffer = function (base64) {
            var binary_string, bytes, i, j, len, ref;
            binary_string = window.atob(base64);
            len = binary_string.length;
            bytes = new Uint8Array(len);
            for (i = j = 0, ref = len - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                bytes[i] = binary_string.charCodeAt(i);
            }
            return bytes.buffer;
        };


        /*
    Converts a base64 encoded string into a base64URL string
    data: base64  encoded input string
     */

        Helper.base64ToBase64URL = function (data) {
            data = data.split('=').toString();
            data = data.split('+').join('-').toString();
            data = data.split('/').join('_').toString();
            data = data.split(',').join('').toString();
            data = data.trim();
            return data;
        };


        /*
    Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
    use window.btoa' step. Adapted from http://jsperf.com/encoding-xhr-image-data/5
     */

        Helper.arrayBufferToBase64 = function (arrayBuffer) {
            var a, b, base64, byteLength, byteRemainder, bytes, c, chunk, chunks, encodings, get3To4Conversion, i,
                mainLength;
            encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            bytes = new Uint8Array(arrayBuffer);
            byteLength = bytes.byteLength;
            byteRemainder = byteLength % 3;
            mainLength = byteLength - byteRemainder;
            get3To4Conversion = function (i) {
                var a, b, c, chunk, d;
                chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
                a = (chunk & 16515072) >> 18;
                b = (chunk & 258048) >> 12;
                c = (chunk & 4032) >> 6;
                d = chunk & 63;
                return encodings[a] + encodings[b] + encodings[c] + encodings[d];
            };
            chunks = (function () {
                var j, ref, results;
                results = [];
                for (i = j = 0, ref = mainLength; j < ref; i = j += 3) {
                    results.push(get3To4Conversion(i));
                }
                return results;
            })();
            base64 = chunks.join('');
            if (byteRemainder === 1) {
                chunk = bytes[mainLength];
                a = (chunk & 252) >> 2;
                b = (chunk & 3) << 4;
                base64 += encodings[a] + encodings[b] + '==';
            } else if (byteRemainder === 2) {
                chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
                a = (chunk & 64512) >> 10;
                b = (chunk & 1008) >> 4;
                c = (chunk & 15) << 2;
                base64 += encodings[a] + encodings[b] + encodings[c] + '=';
            }
            return base64;
        };


        /*
    Concatinates two arrayBuffers results in buffer1||buffer2
    buffer1: The first Buffer
    buffer2: The second Buffer
     */

        Helper.concatArrayBuffers = function (buffer1, buffer2) {
            var cBuffer;
            cBuffer = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
            cBuffer.set(new Uint8Array(buffer1), 0);
            cBuffer.set(new Uint8Array(buffer2), buffer1.byteLength);
            return cBuffer.buffer;
        };


        /*
    Gererates a 256 Bit GUID and return it as an base64 encoded string
     */

        Helper.generateGUID = function () {
            var id;
            id = window.crypto.getRandomValues(new Uint8Array(32));
            id = Helper.arrayBufferToBase64(id);
            return id = Helper.base64ToBase64URL(id);
        };


        /*
    Gets an identifer from the Mapping enumeration from an passed uri
     */

        Helper.mapFromURI = function (uri) {
            var internalIdentifier, result;
            uri = uri.toLowerCase();
            uri = uri.toLowerCase();
            uri = btoa(uri);
            uri = Helper.base64ToBase64URL(uri);
            internalIdentifier = XMLSecEnum.URIMapper[uri];
            result = XMLSecEnum.WebCryptoAlgMapper[internalIdentifier];
            if (result) {
                return result;
            } else {
                return internalIdentifier;
            }
        };

        Helper.base64URLtoBase64 = function (base64URL) {
            base64URL = base64URL.split('-').join('+').toString();
            base64URL = base64URL.split('_').join('/').toString();
            if (base64URL.length % 4 === 1) {
                base64URL += "=";
            }
            if (base64URL.length % 4 === 2) {
                base64URL += "==";
            }
            return base64URL;
        };


        /*
    Ensures that the actual node has an Id. If not create one
     */

        Helper.ensureHasId = function (node) {
            var attr, i, id, j, ref;
            attr = "";
            if (node.nodeType === 9) {
                node = node.documentElement;
            }
            for (i = j = 0, ref = XMLSecEnum.idAttributes.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                attr = utils.findAttr(node, XMLSecEnum.idAttributes[i]);
                if (attr) {
                    break;
                }
            }
            if (attr) {
                return attr.value;
            }
            id = Helper.generateGUID();
            node.setAttribute('ID', id);
            return id;
        };

        return Helper;

    })();

}).call(this);

/*
Adapted from certain functions from here:
https://github.com/yaronn/ws.js/blob/master/lib/utils.js
 */

(function () {
    window.utils = (function () {
        function utils() {
        }

        utils.findAttr = function (node, localName, namespace) {
            var attr, i, len, ref;
            ref = node.attributes;
            for (i = 0, len = ref.length; i < len; i++) {
                attr = ref[i];
                if (this.attrEqualsExplicitly(attr, localName, namespace) || this.attrEqualsImplicitly(attr, localName, namespace, node)) {
                    return attr;
                }
            }
            return null;
        };

        utils.findFirst = function (doc, input_xpath) {
            var nodes;
            nodes = xpath.select(input_xpath, doc);
            if (nodes.length === 0) {
                throw "could not find xpath " + input_xpath;
            }
            return nodes[0];
        };

        utils.findChilds = function (node, localName, namespace) {
            var child, i, len, ref, res;
            node = node.documentElement || node;
            res = [];
            ref = node.childNodes;
            for (i = 0, len = ref.length; i < len; i++) {
                child = ref[i];
                if (child.localName === localName && (child.namespaceURI === namespace || !namespace)) {
                    res.push(child);
                }
            }
            return res;
        };

        utils.attrEqualsExplicitly = function (attr, localName, namespace) {
            return attr.localName === localName && (attr.namespaceURI === namespace || !namespace);
        };

        utils.attrEqualsImplicitly = function (attr, localName, namespace, node) {
            return attr.localName === localName && ((!attr.namespaceURI && node.namespaceURI === namespace) || !namespace);
        };

        utils.parseXML = function (data) {
            var error, xml;
            if (!data || typeof data !== "string") {
                return null;
            }
            try {
                xml = (new window.DOMParser()).parseFromString(data, "text/xml");
            } catch (error1) {
                error = error1;
                xml = void 0;
            }
            if (!xml || xml.getElementsByTagName("parsererror").length) {
                throw "Invalid XML: " + data;
            }
            return xml;
        };

        return utils;

    })();

}).call(this);
(function () {
    window.Algorithms = (function () {
        function Algorithms() {
        }


        /*
    Provides access to the internal identifiers
     */

        Algorithms.EncryptionAlgorithms = {
            AES: {
                CBC: {
                    128: "AESCBC128",
                    192: "AESCBC192",
                    256: "AESCBC256"
                },
                GCM: {
                    128: "AESGCM128",
                    192: "AESGCM192",
                    256: "AESGCM256"
                }
            },
            RSA: {
                OAEP: "RSAOAEP"
            }
        };

        Algorithms.SigningAlgorithms = {
            RSA: {
                SHA1: "RSASHA1"
            },
            HMAC: {
                SHA1: "HMACSHA1"
            }
        };

        Algorithms.DigestAlgorithms = {
            SHA1: "SHA1"
        };

        Algorithms.TransformAlgorithms = {
            C14N: "c14n",
            Enveloped_Signature: "envSig"
        };

        return Algorithms;

    })();

    ({
        constructor: function () {
        }
    });

}).call(this);
(function e(t, n, r) {
    function s(o, u) {
        if (!n[o]) {
            if (!t[o]) {
                var a = typeof require == "function" && require;
                if (!u && a) return a(o, !0);
                if (i) return i(o, !0);
                var f = new Error("Cannot find module '" + o + "'");
                throw f.code = "MODULE_NOT_FOUND", f
            }
            var l = n[o] = {exports: {}};
            t[o][0].call(l.exports, function (e) {
                var n = t[o][1][e];
                return s(n ? n : e)
            }, l, l.exports, e, t, n, r)
        }
        return n[o].exports
    }

    var i = typeof require == "function" && require;
    for (var o = 0; o < r.length; o++) s(r[o]);
    return s
})({
    1: [function (require, module, exports) {
        (function () {
            var c14n;

            window.setImmediate = require('timers').setImmediate;

            c14n = require("xml-c14n")();

            window.CanonicalXML = (function () {
                CanonicalXML.prototype.CanonicalisationMethod = "http://www.w3.org/2001/10/xml-exc-c14n#WithComments";


                /*
    Erzeugt einen neuen Canonicalisierer
     */

                function CanonicalXML(Algorithm) {
                    this.can = c14n.createCanonicaliser(this.CanonicalisationMethod);
                }


                /*
    Erzeugt einen Promise für ein neues canonicalisiertes XML document
     */

                CanonicalXML.prototype.canonicalise = function (RawXML) {
                    var can;
                    can = this.can;
                    return new Promise(function (resolve, reject) {
                        return can.canonicalise(RawXML, function (err, res) {
                            if (err) {
                                return reject(err);
                            } else {
                                return resolve(res);
                            }
                        });
                    });
                };

                return CanonicalXML;

            })();

        }).call(this);

    }, {"timers": 3, "xml-c14n": 4}], 2: [function (require, module, exports) {
// shim for using process in browser
        var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

        var cachedSetTimeout;
        var cachedClearTimeout;

        function defaultSetTimout() {
            throw new Error('setTimeout has not been defined');
        }

        function defaultClearTimeout() {
            throw new Error('clearTimeout has not been defined');
        }

        (function () {
            try {
                if (typeof setTimeout === 'function') {
                    cachedSetTimeout = setTimeout;
                } else {
                    cachedSetTimeout = defaultSetTimout;
                }
            } catch (e) {
                cachedSetTimeout = defaultSetTimout;
            }
            try {
                if (typeof clearTimeout === 'function') {
                    cachedClearTimeout = clearTimeout;
                } else {
                    cachedClearTimeout = defaultClearTimeout;
                }
            } catch (e) {
                cachedClearTimeout = defaultClearTimeout;
            }
        }())

        function runTimeout(fun) {
            if (cachedSetTimeout === setTimeout) {
                //normal enviroments in sane situations
                return setTimeout(fun, 0);
            }
            // if setTimeout wasn't available but was latter defined
            if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
                cachedSetTimeout = setTimeout;
                return setTimeout(fun, 0);
            }
            try {
                // when when somebody has screwed with setTimeout but no I.E. maddness
                return cachedSetTimeout(fun, 0);
            } catch (e) {
                try {
                    // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when
                    // called normally
                    return cachedSetTimeout.call(null, fun, 0);
                } catch (e) {
                    // same as above but when it's a version of I.E. that must have the global object for 'this',
                    // hopfully our context correct otherwise it will throw a global error
                    return cachedSetTimeout.call(this, fun, 0);
                }
            }


        }

        function runClearTimeout(marker) {
            if (cachedClearTimeout === clearTimeout) {
                //normal enviroments in sane situations
                return clearTimeout(marker);
            }
            // if clearTimeout wasn't available but was latter defined
            if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
                cachedClearTimeout = clearTimeout;
                return clearTimeout(marker);
            }
            try {
                // when when somebody has screwed with setTimeout but no I.E. maddness
                return cachedClearTimeout(marker);
            } catch (e) {
                try {
                    // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when
                    // called normally
                    return cachedClearTimeout.call(null, marker);
                } catch (e) {
                    // same as above but when it's a version of I.E. that must have the global object for 'this',
                    // hopfully our context correct otherwise it will throw a global error. Some versions of I.E. have
                    // different rules for clearTimeout vs setTimeout
                    return cachedClearTimeout.call(this, marker);
                }
            }


        }

        var queue = [];
        var draining = false;
        var currentQueue;
        var queueIndex = -1;

        function cleanUpNextTick() {
            if (!draining || !currentQueue) {
                return;
            }
            draining = false;
            if (currentQueue.length) {
                queue = currentQueue.concat(queue);
            } else {
                queueIndex = -1;
            }
            if (queue.length) {
                drainQueue();
            }
        }

        function drainQueue() {
            if (draining) {
                return;
            }
            var timeout = runTimeout(cleanUpNextTick);
            draining = true;

            var len = queue.length;
            while (len) {
                currentQueue = queue;
                queue = [];
                while (++queueIndex < len) {
                    if (currentQueue) {
                        currentQueue[queueIndex].run();
                    }
                }
                queueIndex = -1;
                len = queue.length;
            }
            currentQueue = null;
            draining = false;
            runClearTimeout(timeout);
        }

        process.nextTick = function (fun) {
            var args = new Array(arguments.length - 1);
            if (arguments.length > 1) {
                for (var i = 1; i < arguments.length; i++) {
                    args[i - 1] = arguments[i];
                }
            }
            queue.push(new Item(fun, args));
            if (queue.length === 1 && !draining) {
                runTimeout(drainQueue);
            }
        };

// v8 likes predictible objects
        function Item(fun, array) {
            this.fun = fun;
            this.array = array;
        }

        Item.prototype.run = function () {
            this.fun.apply(null, this.array);
        };
        process.title = 'browser';
        process.browser = true;
        process.env = {};
        process.argv = [];
        process.version = ''; // empty string to avoid regexp issues
        process.versions = {};

        function noop() {
        }

        process.on = noop;
        process.addListener = noop;
        process.once = noop;
        process.off = noop;
        process.removeListener = noop;
        process.removeAllListeners = noop;
        process.emit = noop;
        process.prependListener = noop;
        process.prependOnceListener = noop;

        process.listeners = function (name) {
            return []
        }

        process.binding = function (name) {
            throw new Error('process.binding is not supported');
        };

        process.cwd = function () {
            return '/'
        };
        process.chdir = function (dir) {
            throw new Error('process.chdir is not supported');
        };
        process.umask = function () {
            return 0;
        };

    }, {}], 3: [function (require, module, exports) {
        var nextTick = require('process/browser.js').nextTick;
        var apply = Function.prototype.apply;
        var slice = Array.prototype.slice;
        var immediateIds = {};
        var nextImmediateId = 0;

// DOM APIs, for completeness

        exports.setTimeout = function () {
            return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
        };
        exports.setInterval = function () {
            return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
        };
        exports.clearTimeout =
            exports.clearInterval = function (timeout) {
                timeout.close();
            };

        function Timeout(id, clearFn) {
            this._id = id;
            this._clearFn = clearFn;
        }

        Timeout.prototype.unref = Timeout.prototype.ref = function () {
        };
        Timeout.prototype.close = function () {
            this._clearFn.call(window, this._id);
        };

// Does not start the time, just sets up the members needed.
        exports.enroll = function (item, msecs) {
            clearTimeout(item._idleTimeoutId);
            item._idleTimeout = msecs;
        };

        exports.unenroll = function (item) {
            clearTimeout(item._idleTimeoutId);
            item._idleTimeout = -1;
        };

        exports._unrefActive = exports.active = function (item) {
            clearTimeout(item._idleTimeoutId);

            var msecs = item._idleTimeout;
            if (msecs >= 0) {
                item._idleTimeoutId = setTimeout(function onTimeout() {
                    if (item._onTimeout)
                        item._onTimeout();
                }, msecs);
            }
        };

// That's not how node.js implements it but the exposed api is the same.
        exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function (fn) {
            var id = nextImmediateId++;
            var args = arguments.length < 2 ? false : slice.call(arguments, 1);

            immediateIds[id] = true;

            nextTick(function onNextTick() {
                if (immediateIds[id]) {
                    // fn.call() is faster so we optimize for the common use-case
                    // @see http://jsperf.com/call-apply-segu
                    if (args) {
                        fn.apply(null, args);
                    } else {
                        fn.call(null);
                    }
                    // Prevent ids from leaking
                    exports.clearImmediate(id);
                }
            });

            return id;
        };

        exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function (id) {
            delete immediateIds[id];
        };
    }, {"process/browser.js": 2}], 4: [function (require, module, exports) {
        var ExclusiveCanonicalisation = require("./lib/algorithm/exclusive-canonicalisation");

        var builtIn = {
            algorithms: {
                "http://www.w3.org/2001/10/xml-exc-c14n#": function (options) {
                    return new ExclusiveCanonicalisation(options);
                },
                "http://www.w3.org/2001/10/xml-exc-c14n#WithComments": function (options) {
                    options = Object.create(options || null);
                    options.includeComments = true;
                    return new ExclusiveCanonicalisation(options);
                },
            },
        };

        var CanonicalisationFactory = module.exports = function CanonicalisationFactory() {
            if (!(this instanceof CanonicalisationFactory)) {
                return new CanonicalisationFactory();
            }

            this.algorithms = Object.create(builtIn.algorithms);
        };

        CanonicalisationFactory.prototype.registerAlgorithm = function registerAlgorithm(uri, implementation) {
            this.algorithms[uri] = implementation;

            return this;
        };

        CanonicalisationFactory.prototype.getAlgorithm = function getAlgorithm(uri) {
            return this.algorithms[uri];
        };

        CanonicalisationFactory.prototype.createCanonicaliser = function createCanonicaliser(uri, options) {
            return this.algorithms[uri](options);
        };

    }, {"./lib/algorithm/exclusive-canonicalisation": 6}], 5: [function (require, module, exports) {
        var Algorithm = module.exports = function Algorithm(options) {
        };

        Algorithm.prototype.name = function name() {
            return null;
        };

        Algorithm.prototype.canonicalise = function canonicalise(node, cb) {
            setImmediate(function () {
                return cb(Error("not implemented"));
            });
        };

    }, {}], 6: [function (require, module, exports) {
        var escape = require("../escape");

        var Algorithm = require("../algorithm");

        var ExclusiveCanonicalisation = module.exports = function ExclusiveCanonicalisation(options) {
            Algorithm.call(this, options);

            options = options || {};

            this.includeComments = !!options.includeComments;
            this.inclusiveNamespaces = options.inclusiveNamespaces || [];
        };
        ExclusiveCanonicalisation.prototype = Object.create(Algorithm.prototype, {constructor: {value: ExclusiveCanonicalisation}});

        ExclusiveCanonicalisation.prototype.name = function name() {
            return "http://www.w3.org/2001/10/xml-exc-c14n#" + (this.includeComments ? "WithComments" : "");
        };

        ExclusiveCanonicalisation.prototype.canonicalise = function canonicalise(node, cb) {
            var self = this;

            // ensure asynchronicity
            setImmediate(function () {
                try {
                    var res = self._processInner(node);
                } catch (e) {
                    return cb(e);
                }

                return cb(null, res);
            });
        };

        ExclusiveCanonicalisation.prototype.getIncludeComments = function getIncludeComments() {
            return !!this.includeComments;
        };

        ExclusiveCanonicalisation.prototype.setIncludeComments = function setIncludeComments(includeComments) {
            this.includeComments = !!includeComments;
        };

        ExclusiveCanonicalisation.prototype.getInclusiveNamespaces = function getInclusiveNamespaces() {
            return this.inclusiveNamespaces.slice();
        };

        ExclusiveCanonicalisation.prototype.setInclusiveNamespaces = function setInclusiveNamespaces(inclusiveNamespaces) {
            this.inclusiveNamespaces = inclusiveNamespaces.slice();

            return this;
        };

        ExclusiveCanonicalisation.prototype.addInclusiveNamespace = function addInclusiveNamespace(inclusiveNamespace) {
            this.inclusiveNamespaces.push(inclusiveNamespace);

            return this;
        };

        var _compareAttributes = function _compareAttributes(a, b) {
            if (!a.prefix && b.prefix) {
                return -1;
            }

            if (!b.prefix && a.prefix) {
                return 1;
            }

            return a.name.localeCompare(b.name);
        };

        var _compareNamespaces = function _compareNamespaces(a, b) {
            var attr1 = a.prefix + a.namespaceURI,
                attr2 = b.prefix + b.namespaceURI;

            if (attr1 === attr2) {
                return 0;
            }

            return attr1.localeCompare(attr2);
        };

        ExclusiveCanonicalisation.prototype._renderAttributes = function _renderAttributes(node) {
            return (node.attributes ? [].slice.call(node.attributes) : []).filter(function (attribute) {
                return attribute.name.indexOf("xmlns") !== 0;
            }).sort(_compareAttributes).map(function (attribute) {
                return " " + attribute.name + "=\"" + escape.attributeEntities(attribute.value) + "\"";
            }).join("");
        };

        ExclusiveCanonicalisation.prototype._renderNamespace = function _renderNamespace(node, prefixesInScope, defaultNamespace) {
            var res = "",
                newDefaultNamespace = defaultNamespace,
                newPrefixesInScope = prefixesInScope.slice(),
                nsListToRender = [];

            var currentNamespace = node.namespaceURI || "";

            if (node.prefix) {
                var foundPrefix = newPrefixesInScope.filter(function (e) {
                    return e.prefix === node.prefix;
                }).shift();

                if (foundPrefix && foundPrefix.namespaceURI !== node.namespaceURI) {
                    for (var i = 0; i < newPrefixesInScope.length; ++i) {
                        if (newPrefixesInScope[i].prefix === node.prefix) {
                            newPrefixesInScope.splice(i--, 1);
                        }
                    }

                    foundPrefix = null;
                }

                if (!foundPrefix) {
                    nsListToRender.push({
                        prefix: node.prefix,
                        namespaceURI: node.namespaceURI,
                    });

                    newPrefixesInScope.push({
                        prefix: node.prefix,
                        namespaceURI: node.namespaceURI,
                    });
                }
            } else if (defaultNamespace !== currentNamespace) {
                newDefaultNamespace = currentNamespace;
                res += " xmlns=\"" + escape.attributeEntities(newDefaultNamespace) + "\"";
            }

            if (node.attributes) {
                for (var i = 0; i < node.attributes.length; i++) {
                    var attr = node.attributes[i],
                        foundPrefix = null;

                    if (attr.prefix && attr.prefix !== "xmlns") {
                        foundPrefix = newPrefixesInScope.filter(function (e) {
                            return e.prefix === attr.prefix;
                        }).shift();

                        if (foundPrefix && foundPrefix.namespaceURI !== attr.namespaceURI) {
                            for (var i = 0; i < newPrefixesInScope.length; ++i) {
                                if (newPrefixesInScope[i].prefix === attr.prefix) {
                                    newPrefixesInScope.splice(i--, 1);
                                }
                            }

                            foundPrefix = null;
                        }
                    }

                    if (attr.prefix && !foundPrefix && attr.prefix !== "xmlns") {
                        nsListToRender.push({
                            prefix: attr.prefix,
                            namespaceURI: attr.namespaceURI,
                        });

                        newPrefixesInScope.push({
                            prefix: attr.prefix,
                            namespaceURI: attr.namespaceURI,
                        });
                    } else if (attr.prefix && attr.prefix === "xmlns" && this.inclusiveNamespaces.indexOf(attr.localName) !== -1) {
                        nsListToRender.push({
                            prefix: attr.localName,
                            namespaceURI: attr.nodeValue,
                        });
                    }
                }
            }

            nsListToRender.sort(_compareNamespaces);

            for (var i = 0; i < nsListToRender.length; ++i) {
                res += " xmlns:" + nsListToRender[i].prefix + "=\"" + escape.attributeEntities(nsListToRender[i].namespaceURI) + "\"";
            }

            return {
                rendered: res,
                newDefaultNamespace: newDefaultNamespace,
                newPrefixesInScope: newPrefixesInScope,
            };
        };

        ExclusiveCanonicalisation.prototype._renderComment = function _renderComment(node) {
            var isOutsideDocument = (node.ownerDocument === node.parentNode),
                isBeforeDocument = null,
                isAfterDocument = null;

            if (isOutsideDocument) {
                var nextNode = node,
                    previousNode = node;

                while (nextNode !== null) {
                    if (nextNode === node.ownerDocument.documentElement) {
                        isBeforeDocument = true;
                        break;
                    }

                    nextNode = nextNode.nextSibling;
                }

                while (previousNode !== null) {
                    if (previousNode === node.ownerDocument.documentElement) {
                        isAfterDocument = true;
                        break;
                    }

                    previousNode = previousNode.previousSibling;
                }
            }

            return (isAfterDocument ? "\n" : "") + "<!--" + escape.textEntities(node.data) + "-->" + (isBeforeDocument ? "\n" : "");
        };

        ExclusiveCanonicalisation.prototype._renderProcessingInstruction = function _renderProcessingInstruction(node) {
            if (node.tagName === "xml") {
                return "";
            }

            var isOutsideDocument = (node.ownerDocument === node.parentNode),
                isBeforeDocument = null,
                isAfterDocument = null;

            if (isOutsideDocument) {
                var nextNode = node,
                    previousNode = node;

                while (nextNode !== null) {
                    if (nextNode === node.ownerDocument.documentElement) {
                        isBeforeDocument = true;
                        break;
                    }

                    nextNode = nextNode.nextSibling;
                }

                while (previousNode !== null) {
                    if (previousNode === node.ownerDocument.documentElement) {
                        isAfterDocument = true;
                        break;
                    }

                    previousNode = previousNode.previousSibling;
                }
            }

            return (isAfterDocument ? "\n" : "") + "<?" + node.tagName + (node.data ? " " + escape.textEntities(node.data) : "") + "?>" + (isBeforeDocument ? "\n" : "");
        };

        ExclusiveCanonicalisation.prototype._processInner = function _processInner(node, prefixesInScope, defaultNamespace) {
            defaultNamespace = defaultNamespace || "";
            prefixesInScope = prefixesInScope || [];

            if (node.nodeType === 3) {
                return (node.ownerDocument === node.parentNode) ? escape.textEntities(node.data.trim()) : escape.textEntities(node.data);
            }

            if (node.nodeType === 7) {
                return this._renderProcessingInstruction(node);
            }

            if (node.nodeType === 8) {
                return this.includeComments ? this._renderComment(node) : "";
            }

            if (node.nodeType === 10) {
                return "";
            }

            var ns = this._renderNamespace(node, prefixesInScope, defaultNamespace);

            var self = this;

            return [
                node.tagName ? "<" + node.tagName + ns.rendered + this._renderAttributes(node) + ">" : "",
                [].slice.call(node.childNodes).map(function (child) {
                    return self._processInner(child, ns.newPrefixesInScope, ns.newDefaultNamespace);
                }).join(""),
                node.tagName ? "</" + node.tagName + ">" : "",
            ].join("");
        };

    }, {"../algorithm": 5, "../escape": 7}], 7: [function (require, module, exports) {
        var entities = exports.entities = {
            "&": "&amp;",
            "\"": "&quot;",
            "<": "&lt;",
            ">": "&gt;",
            "\t": "&#x9;",
            "\n": "&#xA;",
            "\r": "&#xD;",
        };

        var attributeEntities = exports.attributeEntities = function escapeAttributeEntities(string) {
            return string.replace(/([\&<"\t\n\r])/g, function (character) {
                return entities[character];
            });
        };

        var textEntities = exports.textEntities = function escapeTextEntities(string) {
            return string.replace(/([\&<>\r])/g, function (character) {
                return entities[character];
            });
        };

    }, {}]
}, {}, [1]);
(function () {
    if (window.webcryptoImpl == null) {
        window.webcryptoImpl = window.crypto.subtle;
    }


    /*
  Wrapper-Class for Web Crypto API function calls
   */

    window.CryptoWrapper = (function () {
        function CryptoWrapper() {
        }


        /*
    Create a Signature
    input: serialized node
    signatureParams: SignaturParams Object
     */

        CryptoWrapper.Sign = function (input, signatureParams) {
            var buffer;
            buffer = new TextEncoder("utf-8").encode(input);
            return window.webcryptoImpl.sign({
                name: signatureParams.signAlg.name,
                hash: {
                    name: signatureParams.hash
                }
            }, signatureParams.privateKey, buffer).then(function (signature) {
                return Helper.arrayBufferToBase64(signature);
            });
        };


        /*
    Signature verification
    input: serialized xml node that has to be verified
    publicKey: verifing key
    signatureParams: SignaturParams Object
     */

        CryptoWrapper.Verify = function (input, publicKey, signatureParams) {
            var buffer, signatureValueBuffer;
            buffer = new TextEncoder("utf-8").encode(input);
            signatureValueBuffer = Helper.base64ToArrayBuffer(signatureParams.signatureValue);
            return window.webcryptoImpl.verify({
                name: signatureParams.signAlg.name,
                hash: {
                    name: signatureParams.signAlg.name
                }
            }, publicKey, signatureValueBuffer, buffer).then(function (signature) {
                return signature;
            });
        };


        /*
    wraps a symmetric key with an asymetric key
    symKey: symmetric key thats gone be wrapped
    asymKey: asymetric key used to wrap the symmetric key
     */

        CryptoWrapper.WrapKey = function (symKey, asymKey) {
            return window.webcryptoImpl.wrapKey("raw", symKey, asymKey, {
                name: asymKey.algorithm.name,
                hash: {
                    name: asymKey.algorithm.hash.name
                }
            }).then(function (wrappedKey) {
                return Helper.arrayBufferToBase64(wrappedKey);
            }).then(null, function (err) {
                return console.error(err);
            });
        };


        /*
    unwraps an wrapped key
    encKey: The wrapped symmetric key
    asymKey: The asymetric key to unwrap the wrapped key
    symKeyAlg: The symetric algorithm belonging to the wrapped key
     */

        CryptoWrapper.UnWrapKey = function (encKey, asymKey, symKeyAlg) {
            encKey = Helper.base64ToArrayBuffer(encKey);
            return window.webcryptoImpl.unwrapKey("raw", encKey, asymKey, {
                name: asymKey.algorithm.name,
                hash: {
                    name: asymKey.algorithm.hash.name
                }
            }, {
                name: symKeyAlg
            }, false, ["encrypt", "decrypt"]).then(function (key) {
                return key;
            }).then(null, function (err) {
                return console.error(err);
            });
        };


        /*
    Prerforms the AES Encryption
    input: The nodeset to encrypt
    key: The symmetric key
    staticIV: If true, the Encryption Method will use an IV initialsed with "0" instead of an random value. USE ONLY FOR TESTING!
     */

        CryptoWrapper.Encryption = function (input, key, staticIV) {
            var IV, buffer, mode, nodeType;
            mode = key.algorithm.name;
            nodeType = input.nodeType;
            input = new XMLSerializer().serializeToString(input);
            buffer = new TextEncoder("utf-8").encode(input);
            if (mode === "AES-GCM") {
                IV = window.crypto.getRandomValues(new Uint8Array(12));
            } else {
                IV = window.crypto.getRandomValues(new Uint8Array(16));
            }
            if (staticIV) {
                IV = IV.fill(0);
            }
            return window.webcryptoImpl.encrypt({
                name: mode,
                iv: IV
            }, key, buffer).then(function (encrypted) {
                var result;
                encrypted = Helper.concatArrayBuffers(IV, encrypted);
                return result = [Helper.arrayBufferToBase64(encrypted), nodeType];
            });
        };


        /*
    Method to bypass the Web Crypto / XML Encryption incompatible padding.
    Web Crypto only supports PKCS#7 Padding but XML Encryption expect ISO 10126 Padding.
    This method appends a new padding block with "16" to the chipher text.
    The original ISO 10126 Padding becomes a part of the plaintext and must be removed later.
    buffer: The original buffer with ISO 10126 padding
    key: The encryption key
     */

        CryptoWrapper.AES_ModifyPadding = function (buffer, key) {
            var lastBlock, mode, modifiedPadding, newPadding;
            modifiedPadding = "";
            mode = key.algorithm.name;
            lastBlock = buffer.slice(buffer.byteLength - 16, buffer.byteLength);
            newPadding = new Uint8Array(16);
            newPadding.fill(16);
            return window.webcryptoImpl.encrypt({
                name: mode,
                iv: lastBlock
            }, key, newPadding).then(function (newLastBlock) {
                return Helper.concatArrayBuffers(buffer, newLastBlock);
            });
        };


        /*
    decrypt an ciphertext
    input: The ciphertext
    key: The symmetric decryption key
     */

        CryptoWrapper.Decryption = function (input, key) {
            var IV, buffer, mode;
            mode = key.algorithm.name;
            buffer = Helper.base64ToArrayBuffer(input);
            if (mode === "AES-GCM") {
                IV = buffer.slice(0, 12);
                buffer = buffer.slice(12, buffer.byteLength);
            } else {
                IV = buffer.slice(0, 16);
                buffer = buffer.slice(16, buffer.byteLength);
            }
            IV = new Uint8Array(IV);
            if (mode === "AES-CBC") {
                return this.AES_ModifyPadding(buffer, key).then(function (newBuffer) {
                    return window.webcryptoImpl.decrypt({
                        name: mode,
                        iv: IV
                    }, key, newBuffer).then(function (decrypted) {
                        var decryptedArray, padding;
                        decrypted = decrypted.slice(0, decrypted.byteLength - 16);
                        decryptedArray = new Uint8Array(decrypted);
                        padding = decryptedArray[decryptedArray.length - 1];
                        if (padding <= 16) {
                            decrypted = decrypted.slice(0, decrypted.byteLength - padding);
                        }
                        return decrypted = String.fromCharCode.apply(null, new Uint8Array(decrypted));
                    }).then(null, function (err) {
                        return console.error(err);
                    });
                });
            } else {
                return window.webcryptoImpl.decrypt({
                    name: mode,
                    iv: IV
                }, key, buffer).then(function (decrypted) {
                    return String.fromCharCode.apply(null, new Uint8Array(decrypted));
                }).then(null, function (err) {
                    return console.error(err);
                });
            }
        };


        /*
    performs a hash operation
    input: the data to hash
    algorithm: the hash algorithm to use
     */

        CryptoWrapper.hash = function (input, algorithm) {
            var buffer;
            buffer = new TextEncoder("utf-8").encode(input);
            return webcryptoImpl.digest(algorithm, buffer).then(function (digest) {
                return Helper.arrayBufferToBase64(digest);
            }).then(null, function (err) {
                return err;
            });
        };

        return CryptoWrapper;

    })();

}).call(this);
(function () {
    window.ElementBuilder = (function () {
        function ElementBuilder() {
        }


        /*
    Builds an Element for detached signature creation
     */

        ElementBuilder.buildWrappingElement = function () {
            var docType, xmlDoc;
            docType = document.implementation.createDocumentType("Document", "Document", "<!ENTITY Document 'Document'>");
            xmlDoc = document.implementation.createDocument("", "Document", docType);
            return xmlDoc;
        };


        /*
    Builds the KeyInfo Element for RSA Keys
    prefix: The XMLNS prefix
    modulus: The modulus of the RSA Key
    exponent: The public exponent of the RSA Key
     */

        ElementBuilder.buildRSAKeyInfoElement = function (prefix, modulus, exponent) {
            var RSAValueNode, docType, exponentNode, exponenttext, keyInfoNode, keyValueNode, modulusNode, modulustext,
                xmlDoc;
            docType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
            xmlDoc = document.implementation.createDocument("", "keyInfo", docType);
            keyInfoNode = xmlDoc.createElement(prefix + "KeyInfo");
            keyValueNode = xmlDoc.createElement(prefix + "KeyValue");
            RSAValueNode = xmlDoc.createElement(prefix + "RSAKeyValue");
            modulusNode = xmlDoc.createElement(prefix + "Modulus");
            modulustext = xmlDoc.createTextNode(modulus);
            modulusNode.appendChild(modulustext);
            exponentNode = xmlDoc.createElement(prefix + "Exponent");
            exponenttext = xmlDoc.createTextNode(exponent);
            exponentNode.appendChild(exponenttext);
            RSAValueNode.appendChild(modulusNode);
            RSAValueNode.appendChild(exponentNode);
            keyValueNode.appendChild(RSAValueNode);
            keyInfoNode.appendChild(keyValueNode);
            return xmlDoc.documentElement.appendChild(keyInfoNode);
        };


        /*
    Builds the Signature Element
    prefix: The XMLNS prefix
    signedInfo: The signedInfo Element
    signatureValue: The computed signature value
     */

        ElementBuilder.buildSignatureElement = function (prefix, signedInfo, signatureValue) {
            var docType, signatureNode, signatureValueNode, textnode, xmlDoc, xmlNsAttrPrefix;
            xmlNsAttrPrefix = prefix.replace(":", "");
            if (prefix !== "") {
                xmlNsAttrPrefix = ":" + xmlNsAttrPrefix;
            }
            docType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
            xmlDoc = document.implementation.createDocument("", "signature", docType);
            signatureNode = xmlDoc.createElement(prefix + "Signature");
            signatureNode.setAttribute("xmlns" + xmlNsAttrPrefix, XMLSecEnum.namespaceURIs.xmlSig);
            signatureNode.appendChild(signedInfo);
            signatureValueNode = xmlDoc.createElement(prefix + "SignatureValue");
            textnode = xmlDoc.createTextNode(signatureValue);
            signatureValueNode.appendChild(textnode);
            signatureNode.appendChild(signatureValueNode);
            return xmlDoc.documentElement.appendChild(signatureNode);
        };


        /*
    Builds the signedInfo Element
    signatureParams: The signatureParams object
    refElements: The reference Elements
     */

        ElementBuilder.buildSignedInfoElement = function (signatureParams, refElements) {
            var canonNode, docType, i, j, prefix, ref, signatureMethodeNode, signedInfoNode, xmlDoc, xmlNsAttrPrefix;
            prefix = signatureParams.prefix;
            xmlNsAttrPrefix = prefix.replace(":", "");
            docType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
            xmlDoc = document.implementation.createDocument("", "signedInfo", docType);
            signedInfoNode = xmlDoc.createElementNS(XMLSecEnum.namespaceURIs.xmlSig, prefix + "SignedInfo");
            canonNode = xmlDoc.createElement(prefix + "CanonicalizationMethod");
            canonNode.setAttribute("Algorithm", signatureParams.canonicalisationAlgURI);
            signedInfoNode.appendChild(canonNode);
            signatureMethodeNode = xmlDoc.createElement(prefix + "SignatureMethod");
            signatureMethodeNode.setAttribute("Algorithm", signatureParams.signAlgURI);
            signedInfoNode.appendChild(signatureMethodeNode);
            for (i = j = 0, ref = refElements.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                signedInfoNode.appendChild(refElements[i]);
            }
            return xmlDoc.documentElement.appendChild(signedInfoNode);
        };


        /*
    Builds the Reference Elements
    id: The Id or XPath of the referenced object
    prefix: The XMLNS prefix
    transforms: Array of Transform-URIs
    algorithem: Algorithm URI
    digestValue: The computed DigestValue
    idBase: Flag wether the URI is ID-Based or not
     */

        ElementBuilder.buildReferenceElement = function (id, prefix, transforms, Algorithm, digestValue) {
            var digestMethodNode, digestValueNode, digestValueText, docType, i, j, ref, referenceNode, transformNode,
                transformsNode, xmlDoc;
            docType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
            xmlDoc = document.implementation.createDocument("", "reference", docType);
            referenceNode = xmlDoc.createElement(prefix + "Reference");

            /*
      Decide whitch URI is uses
       */
            referenceNode.setAttribute("URI", "#" + id);
            transformsNode = xmlDoc.createElement(prefix + "Transforms");
            referenceNode.appendChild(transformsNode);
            for (i = j = 0, ref = transforms.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                transformNode = xmlDoc.createElement(prefix + "Transform");
                transformNode.setAttribute("Algorithm", transforms[i]);
                transformsNode.appendChild(transformNode);
            }
            digestMethodNode = xmlDoc.createElement(prefix + "DigestMethod");
            digestMethodNode.setAttribute("Algorithm", Algorithm);
            referenceNode.appendChild(digestMethodNode);
            digestValueNode = xmlDoc.createElement(prefix + "DigestValue");
            digestValueText = xmlDoc.createTextNode(digestValue);
            digestValueNode.appendChild(digestValueText);
            referenceNode.appendChild(digestValueNode);
            return xmlDoc.documentElement.appendChild(referenceNode);
        };


        /*
    Builds the EncryptedData Element
    typeToEncrypt: Either Content or Element
    chipherValue: The computed chipher value
    encParams: The encParams Object
    encKey (optional): An EncryptedKey element
    encKeyId (optional): The Id of the EncryptedKey element
     */

        ElementBuilder.buildEncryptedDataElement = function (typeToEncrypt, chipherValue, encParams, encKey, encKeyId) {
            var chipherDataNode, chipherValueNode, cipherValueText, createdDoc, docType, encDataNode, encMethodNode,
                keyInfoNode, keyNameNode, keyNameText, prefix, serializer, xmlDoc, xmlNsAttrKeyInfo;
            prefix = encParams.prefix;
            if (prefix) {
                xmlNsAttrKeyInfo = ":" + encParams.keyInfoPrefix.replace(":", "");
            } else {
                prefix = "";
            }
            docType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
            xmlDoc = document.implementation.createDocument("", "EncData", docType);
            encDataNode = xmlDoc.createElementNS(XMLSecEnum.namespaceURIs.xmlEnc, prefix + "EncryptedData");
            if (encKeyId) {
                encDataNode.setAttribute("id", encKeyId);
            }
            encDataNode.setAttribute("Type", typeToEncrypt);
            encMethodNode = xmlDoc.createElementNS(XMLSecEnum.namespaceURIs.xmlEnc, prefix + "EncryptionMethod");
            encMethodNode.setAttribute("Algorithm", encParams.algIdentifer);
            encDataNode.appendChild(encMethodNode);
            if (encKey) {
                keyInfoNode = xmlDoc.createElementNS(XMLSecEnum.namespaceURIs.xmlSig, encParams.keyInfoPrefix + "KeyInfo");
                keyInfoNode.setAttribute("xmlns" + xmlNsAttrKeyInfo, XMLSecEnum.namespaceURIs.xmlSig);
                keyNameNode = xmlDoc.createElementNS(XMLSecEnum.namespaceURIs.xmlSig, encParams.keyInfoPrefix + "KeyName");
                keyNameText = xmlDoc.createTextNode(encParams.asymKeyName);
                keyNameNode.appendChild(keyNameText);
                keyInfoNode.appendChild(keyNameNode);
                keyInfoNode.appendChild(encKey);
                encDataNode.appendChild(keyInfoNode);
            }
            chipherDataNode = xmlDoc.createElementNS(XMLSecEnum.namespaceURIs.xmlEnc, prefix + "CipherData");
            chipherValueNode = xmlDoc.createElementNS(XMLSecEnum.namespaceURIs.xmlEnc, prefix + "CipherValue");
            cipherValueText = xmlDoc.createTextNode(chipherValue);
            chipherValueNode.appendChild(cipherValueText);
            chipherDataNode.appendChild(chipherValueNode);
            encDataNode.appendChild(chipherDataNode);
            xmlDoc.documentElement.appendChild(encDataNode);
            serializer = new XMLSerializer;
            return createdDoc = serializer.serializeToString(xmlDoc.documentElement.appendChild(encDataNode));
        };


        /*
    Creates an encryptedKey element
    encParams: The encryptionParams objekt
    cipherValue: The Ciphervalue of the encrypted Key
     */

        ElementBuilder.buildEncryptedKeyElement = function (encParams, chipherValue) {
            var attrNsPrefix, chipherDataNode, chipherValueNode, cipherValueText, docType, encKeyNode, encMethodNode,
                keyInfoNode, keyNameNode, keyNameText, prefix, xmlDoc, xmlNsAttrPrefix;
            prefix = encParams.keyInfoPrefix;
            if (prefix) {
                xmlNsAttrPrefix = ":" + prefix.replace(":", "");
            } else {
                prefix = "";
                attrNsPrefix = "";
            }
            docType = document.implementation.createDocumentType("dummy", "dummy", "<!ENTITY dummy 'dummy'>");
            xmlDoc = document.implementation.createDocument("", "EncData", docType);
            encKeyNode = xmlDoc.createElement(prefix + "EncryptedKey");
            encMethodNode = xmlDoc.createElement(prefix + "EncryptionMethod");
            encMethodNode.setAttribute("Algorithm", encParams.asymAlgIdentifier);
            encKeyNode.appendChild(encMethodNode);
            keyInfoNode = xmlDoc.createElement(prefix + "KeyInfo");
            keyInfoNode.setAttribute("xmlns" + xmlNsAttrPrefix, XMLSecEnum.namespaceURIs.xmlSig);
            keyNameNode = xmlDoc.createElement(prefix + "KeyName");
            keyNameText = xmlDoc.createTextNode(encParams.asymKeyName);
            keyNameNode.appendChild(keyNameText);
            keyInfoNode.appendChild(keyNameNode);
            encKeyNode.appendChild(keyInfoNode);
            chipherDataNode = xmlDoc.createElement(prefix + "CipherData");
            chipherValueNode = xmlDoc.createElement(prefix + "CipherValue");
            cipherValueText = xmlDoc.createTextNode(chipherValue);
            chipherValueNode.appendChild(cipherValueText);
            encKeyNode.appendChild(chipherValueNode);
            return xmlDoc.documentElement.appendChild(encKeyNode);
        };

        return ElementBuilder;

    })();

}).call(this);
(function () {
    window.EncryptedXML = (function () {
        var createEncryptedData, decryptRecursive, unwrapKey;

        function EncryptedXML() {
        }


        /*
    Performs the encryption of a XML Document
    doc: XML Document to encrypt
    encParams: The EncryptionParams object
     */

        EncryptedXML.prototype.encrypt = function (doc, encParams) {
            var encryptedDataNodes, i, j, k, l, m, nodelist, nodes, ref, ref1;
            encryptedDataNodes = [];
            nodes = [];
            nodelist = [];
            for (j = l = 0, ref = encParams.references.length - 1; 0 <= ref ? l <= ref : l >= ref; j = 0 <= ref ? ++l : --l) {
                nodes[j] = xpath.select(encParams.references[j].xpath, doc);
                if (nodes[j].length === 0) {
                    throw new Error("Node not found or invalid xPath:" + encParams.references[j].xpath);
                }
                for (k = m = 0, ref1 = nodes[j].length - 1; 0 <= ref1 ? m <= ref1 : m >= ref1; k = 0 <= ref1 ? ++m : --m) {
                    nodelist.push(nodes[j][k]);
                }
            }
            return Promise.all((function () {
                var n, ref2, results;
                results = [];
                for (i = n = 0, ref2 = nodelist.length - 1; 0 <= ref2 ? n <= ref2 : n >= ref2; i = 0 <= ref2 ? ++n : --n) {
                    results.push(CryptoWrapper.Encryption(nodelist[i], encParams.symKey, encParams.staticIV).then(function (cipherValue) {
                        var encData, encKeyid;
                        if (encParams.withKeyInfo) {
                            encKeyid = "Id_" + encParams.asymKeyName + "_" + Helper.generateGUID();
                            return encData = createEncryptedData(cipherValue[0], cipherValue[1], encParams, encKeyid).then(function (result) {
                                encData = utils.parseXML(result);
                                return encryptedDataNodes.push([encData, encParams.keyName]);
                            });
                        } else {
                            encData = createEncryptedData(cipherValue[0], cipherValue[1], encParams, encKeyid);
                            encData = utils.parseXML(encData);
                            return encryptedDataNodes.push([encData, ""]);
                        }
                    }));
                }
                return results;
            })()).then(function () {
                var i, n, ref2;
                for (i = n = 0, ref2 = encryptedDataNodes.length - 1; 0 <= ref2 ? n <= ref2 : n >= ref2; i = 0 <= ref2 ? ++n : --n) {
                    nodelist[i].parentNode.replaceChild(encryptedDataNodes[i][0].firstChild, nodelist[i]);
                }
                return doc;
            });
        };


        /*
    creates the encryptedData element
    cipherValue: The CipherValue of the node
    nodeType: Content or element
    encParams: The EncryptionParams object
    id (optional) : The id used if an encryptedKey is uses
     */

        createEncryptedData = function (cipherValue, nodeType, encParams, id) {
            var encDataElement, typeToEncrypt;
            if (nodeType === 3) {
                typeToEncrypt = XMLSecEnum.namespaceURIs.xmlEnc + XMLSecEnum.Type.Content;
            } else {
                typeToEncrypt = XMLSecEnum.namespaceURIs.xmlEnc + XMLSecEnum.Type.Element;
            }
            if (encParams.withKeyInfo) {
                return CryptoWrapper.WrapKey(encParams.symKey, encParams.asymKey).then(function (encKey) {
                    var encDataElement, encKeyEle;
                    encKeyEle = ElementBuilder.buildEncryptedKeyElement(encParams, encKey);
                    return encDataElement = ElementBuilder.buildEncryptedDataElement(typeToEncrypt, cipherValue, encParams, encKeyEle, id);
                });
            } else {
                return encDataElement = ElementBuilder.buildEncryptedDataElement(typeToEncrypt, cipherValue, encParams);
            }
        };


        /*
    Unwraps the encypted key
    encData: one encryptedData element
    asymKey: an assymertric key used for unwrap the symmetric key
     */

        unwrapKey = function (encData, asymKey) {
            var algId, algorithmURI, encKey, encKeyEle;
            algorithmURI = encData.getElementsByTagName(XMLSecEnum.NodeNames.encMethod)[0].getAttribute(XMLSecEnum.AttributeNames.algorithm);
            algId = Helper.mapFromURI(algorithmURI);
            encKeyEle = encData.getElementsByTagName(XMLSecEnum.NodeNames.encKey)[0];
            encKey = encKeyEle.getElementsByTagName(XMLSecEnum.NodeNames.cipherValue)[0].innerHTML;
            encKeyEle.parentNode.removeChild(encKeyEle);
            return CryptoWrapper.UnWrapKey(encKey, asymKey, algId.toUpperCase()).then(function (symKey) {
                return symKey;
            });
        };


        /*
    Decrypts alle encryptedData nodes recursivly to map the right ElementType to the corrosponding Element
    encData: A list of encryptedData Elements
    key: A WebCryptoApi key object either simmertic or asymmetric
    decryptedNode: the already decrypted nodes
    index: The index of the actual processed encryptedData node
     */

        decryptRecursive = function (encData, key, decryptedNodes, index) {
            var cipherValue, type;
            type = Helper.mapFromURI(encData[index].getAttribute(XMLSecEnum.AttributeNames.type));
            if (key.type === XMLSecEnum.KeyTypes.Private) {
                return unwrapKey(encData[index], key).then(function (symKey) {
                    var cipherValue;
                    cipherValue = encData[index].getElementsByTagName(XMLSecEnum.NodeNames.cipherValue)[0].innerHTML;
                    return CryptoWrapper.Decryption(cipherValue, symKey).then(function (decrypted) {
                        decryptedNodes.push([decrypted, type]);
                        if (index < encData.length - 1) {
                            return decryptRecursive(encData, key, decryptedNodes, index + 1);
                        }
                    });
                });
            } else if (key.type === XMLSecEnum.KeyTypes.Secret) {
                cipherValue = encData[index].getElementsByTagName(XMLSecEnum.NodeNames.cipherValue)[0].innerHTML;
                return CryptoWrapper.Decryption(cipherValue, key).then(function (decrypted) {
                    decryptedNodes.push([decrypted, type]);
                    if (index < encData.length - 1) {
                        return decryptRecursive(encData, key, decryptedNodes, index + 1);
                    }
                });
            }
        };

        EncryptedXML.prototype.decrypt = function (doc, key) {
            var decryptedNodes, encData;
            decryptedNodes = [];
            encData = xpath.select(XMLSecEnum.xPathSelectors.EncryptedData, doc);
            if (encData.length === 0) {
                throw new Error("No encData found");
            }
            return decryptRecursive(encData, key, decryptedNodes, 0).then(function () {
                var i, l, parentNode, ref;
                for (i = l = 0, ref = decryptedNodes.length - 1; 0 <= ref ? l <= ref : l >= ref; i = 0 <= ref ? ++l : --l) {
                    if (decryptedNodes[i][1] === XMLSecEnum.Type.Element) {
                        encData[i].parentNode.replaceChild(utils.parseXML(decryptedNodes[i][0]).firstChild, encData[i]);
                    } else {
                        parentNode = encData[i].parentNode;
                        encData[i].parentNode.removeChild(encData[i].parentNode.firstChild);
                        parentNode.innerHTML = decryptedNodes[i][0];
                    }
                }
                return doc;
            });
        };

        return EncryptedXML;

    })();

}).call(this);

/*
Class as Container for all required Parameters for Encryption
 */

(function () {
    window.EncryptionParams = (function () {
        EncryptionParams.symKey = "";

        EncryptionParams.asymKey = "";

        EncryptionParams.asymKeyName = "";

        EncryptionParams.withKeyInfo = "";

        EncryptionParams.staticIV = false;

        EncryptionParams.prefix = "";

        EncryptionParams.references = "";

        EncryptionParams.algIdentifer = "";

        EncryptionParams.asymAlgIdentifier = "";

        EncryptionParams.keyLength = "";

        EncryptionParams.keyInfoPrefix = "";


        /*
     */

        function EncryptionParams() {
            this.staticIV = false;
        }


        /*
    Sets the symmetric key objekt and selects the Algorithm URI with the information from the key
     */

        EncryptionParams.prototype.setSymmetricKey = function (symKey) {
            if (symKey) {
                this.symKey = symKey;
                this.algIdentifer = XMLSecEnum.AlgIdentifiers[symKey.algorithm.name.replace("-", "") + symKey.algorithm.length];
                this.keyLength = symKey.algorithm.length;
                if (!this.algIdentifer || this.algIdentifer === "") {
                    throw new Error("Algorithm not supported:" + algIdentifer);
                }
            }
            return this.symKey;
        };


        /*
    Sets the public key for the keywrapping within the encryption. The name can be choosen. Sets furthermore the URI.
     */

        EncryptionParams.prototype.setPublicKey = function (publicKey, keyName) {
            if (publicKey) {
                this.asymKey = publicKey;
                this.withKeyInfo = true;
                this.asymKeyName = keyName;
                this.asymAlgIdentifier = XMLSecEnum.AlgIdentifiers[publicKey.algorithm.name.replace("-", "")];
                if (!this.asymAlgIdentifier || this.asymAlgIdentifier === "") {
                    throw new Error("Algorithm not supported:" + asymAlgIdentifier);
                }
            }
            return this.asymKey;
        };


        /*
    Sets the prefix for the xml elements. The prefix is optional
     */

        EncryptionParams.prototype.setPrefix = function (prefix) {
            if (prefix !== "") {
                if (prefix.indexOf(":") === -1) {
                    return this.prefix = prefix + ":";
                } else {
                    return this.prefix = prefix;
                }
            }
        };


        /*
    Sets the prefix for the xml elements. The prefix is optional
     */

        EncryptionParams.prototype.setKeyInfoPrefix = function (prefix) {
            if (prefix !== "") {
                if (prefix.indexOf(":") === -1) {
                    return this.keyInfoPrefix = prefix + ":";
                } else {
                    return this.keyInfoPrefix = prefix;
                }
            }
        };


        /*
    Forces a static IV. USE ONLY FOR TESTING
     */

        EncryptionParams.prototype.setStaticIV = function (staticIV) {
            return this.staticIV = staticIV;
        };


        /*
    Sets the References
     */

        EncryptionParams.prototype.setReferences = function (references) {
            return this.references = references;
        };


        /*
    creates an object containig all relevant infomation
     */

        EncryptionParams.prototype.getEncryptionInfo = function () {
            var encryptionInfo;
            return encryptionInfo = {
                symKey: this.symKey,
                keyLength: this.keyLength,
                asymKey: this.asymKey,
                asymKeyName: this.asymKeyName,
                withKeyInfo: this.withKeyInfo,
                staticIV: this.staticIV,
                prefix: this.prefix,
                references: this.references,
                algIdentifer: this.algIdentifer,
                asymAlgIdentifier: this.asymAlgIdentifier,
                keyInfoPrefix: this.keyInfoPrefix
            };
        };

        return EncryptionParams;

    })();

}).call(this);
(function () {
    window.Reference = (function () {
        var sortTransForEnvSig, sortTransForc14n;

        Reference.prototype.xpath = "";

        Reference.prototype.transforms = [];

        Reference.prototype.digestAlg = "";

        Reference.prototype.digestAlgURI = "";

        Reference.prototype.uri = "";

        Reference.prototype.digestValue = "";

        Reference.prototype.isEmptyUri = "";


        /*
    Erzeugung des Referenzobjektes für die Signaturerstellung
     */

        function Reference(xpath, transforms1, digestAlg, uri, digestValue) {
            var i, j, ref;
            this.xpath = xpath;
            this.transforms = transforms1;
            this.digestAlg = digestAlg;
            this.uri = uri;
            this.digestValue = digestValue;
            if (this.xpath === "/*" || this.xpath === "") {
                this.xpath = "/*";
                this.isEmptyUri = true;
            } else {
                this.isEmptyUri = false;
            }
            if (this.transforms) {
                for (i = j = 0, ref = this.transforms.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                    if (this.transforms[i].indexOf("http") > -1) {
                        this.transforms[i] = this.transforms[i];
                    } else if (XMLSecEnum.AlgIdentifiers[this.transforms[i]]) {
                        this.transforms[i] = XMLSecEnum.AlgIdentifiers[this.transforms[i]];
                    } else {
                        throw new Error("Algorithm not Supported:" + this.transforms[i]);
                    }
                }
                this.transforms = sortTransForc14n(this.transforms);
            }
            if (this.digestAlg) {
                if (this.digestAlg.indexOf("http") > -1) {
                    this.digestAlgURI = this.digestAlg;
                    this.digestAlg = Helper.mapFromURI(this.digestAlg);
                } else if (XMLSecEnum.AlgIdentifiers[this.digestAlg.toUpperCase()]) {
                    this.digestAlgURI = XMLSecEnum.AlgIdentifiers[this.digestAlg.toUpperCase()];
                    this.digestAlg = XMLSecEnum.WebCryptoAlgMapper[this.digestAlg.toUpperCase()];
                }
            }
            new Error("Algorithm not Supported:" + this.digestAlg);
        }


        /*
    If the signatureType is "enveloped", then the enveloped signature transformation is set
     */

        Reference.prototype.setEnvelopedSignatureTransform = function () {
            var hasEnvelopedTransform, i, j, ref;
            hasEnvelopedTransform = false;
            if (this.transforms) {
                for (i = j = 0, ref = this.transforms.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                    if (XMLSecEnum.AlgIdentifiers[this.transforms[i]] === XMLSecEnum.AlgIdentifiers.envSig || this.transforms[i] === XMLSecEnum.AlgIdentifiers.envSig) {
                        hasEnvelopedTransform = true;
                        break;
                    }
                }
            }
            if (hasEnvelopedTransform === false) {
                this.transforms[this.transforms.length] = XMLSecEnum.AlgIdentifiers.envSig;
            }
            return this.transforms = sortTransForEnvSig(this.transforms);
        };


        /*
    Puts the envelopedSignature transformation at the top of the list.
     */

        sortTransForEnvSig = function (transforms) {
            var i, j, ref, sortedTransforms;
            sortedTransforms = [];
            sortedTransforms.push(XMLSecEnum.AlgIdentifiers.envSig);
            for (i = j = 0, ref = transforms.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                if (transforms[i] !== XMLSecEnum.AlgIdentifiers.envSig) {
                    sortedTransforms.push(transforms[i]);
                }
            }
            return this.transforms = sortedTransforms;
        };


        /*
    Puts the c14m transformation at the end of the list. since the CanonicalXML is serialized.
     */

        sortTransForc14n = function (transforms) {
            var i, j, ref, sortedTransforms;
            sortedTransforms = [];
            for (i = j = 0, ref = transforms.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                if (transforms[i] !== XMLSecEnum.AlgIdentifiers.c14n) {
                    sortedTransforms.push(transforms[i]);
                }
            }
            sortedTransforms.push(XMLSecEnum.AlgIdentifiers.c14n);
            return this.transforms = sortedTransforms;
        };

        return Reference;

    })();

}).call(this);
(function () {
    window.SignatureParams = (function () {
        SignatureParams.signAlg = "";

        SignatureParams.signAlgURI = "";

        SignatureParams.references = [];

        SignatureParams.publicKey = "";

        SignatureParams.privateKey = "";

        SignatureParams.prefix = "";

        SignatureParams.canonicalisationAlgURI = "";

        SignatureParams.canonicalisationAlg = "";

        SignatureParams.signatureValue = "";

        SignatureParams.signatureType = "";


        /*
    Creates the SignatureParams object and sets the prefix to "" for the case, that the prefix stays unset
     */

        function SignatureParams() {
            this.prefix = "";
        }


        /*
    Sets the variable for the Canonicalisation Algorithmus for the URI and the intern use
     */

        SignatureParams.prototype.setCanonicalisationAlg = function (canonAlg) {
            this.canonicalisationAlgURI = XMLSecEnum.AlgIdentifiers[canonAlg];
            this.canonicalisationAlg = XMLSecEnum.WebCryptoAlgMapper[canonAlg];
            if (!this.canonicalisationAlg || this.canonicalisationAlg === "") {
                throw new Error("Algorithm not supported:" + canonicalisationAlg);
            }
        };


        /*
    Sets the prefix and append ":"
     */

        SignatureParams.prototype.setPrefix = function (prefix) {
            if (prefix !== "") {
                if (prefix.indexOf(":") === -1) {
                    return this.prefix = prefix + ":";
                } else {
                    return this.prefix = prefix;
                }
            }
        };


        /*
    Sets the signature Algorithm variable for URI an internal use
     */

        SignatureParams.prototype.setSigAlg = function (signAlg) {
            this.signAlgURI = XMLSecEnum.AlgIdentifiers[signAlg];
            this.signAlg = XMLSecEnum.WebCryptoAlgMapper[signAlg];
            if (!this.signAlg || this.signAlg === "") {
                throw new Error("Algorithm not supported:" + signAlg);
            }
        };


        /*
    Opatain the Algorithm from a passed URI and sets map it to the internal identifier
     */

        SignatureParams.prototype.setSigAlgFromURI = function (signAlg) {
            this.signAlgURI = signAlg;
            this.signAlg = Helper.mapFromURI(signAlg);
            if (!this.signAlg || this.signAlg === "") {
                throw new Error("Algorithm not supported:" + signAlg);
            }
        };

        SignatureParams.prototype.setCanonicalisationAlgFromURI = function (canonAlg) {
            this.canonicalisationAlgURI = canonAlg;
            this.canonicalisationAlg = Helper.mapFromURI(canonAlg);
            if (!this.canonicalisationAlg || this.canonicalisationAlg === "") {
                throw new Error("Algorithm not supported:" + canonAlg);
            }
        };


        /*
    Sets the reference objects an add the enveloped Signature transformation if nessesary
     */

        SignatureParams.prototype.setReferences = function (references) {
            var i, j, ref, results;
            this.references = references;
            if (this.signatureType === XMLSecEnum.signatureTypesEnum.Enveloped) {
                if (references) {
                    results = [];
                    for (i = j = 0, ref = this.references.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                        results.push(this.references[i].setEnvelopedSignatureTransform());
                    }
                    return results;
                }
            }
        };


        /*
    Sets the public and private key variables
     */

        SignatureParams.prototype.setKeyPair = function (publicKey, privateKey) {
            this.publicKey = publicKey;
            this.privateKey = privateKey;
            if (!this.publicKey || !this.privateKey) {
                throw new Error("No key");
            }
        };


        /*
    Sets the SignatureValue varibale
     */

        SignatureParams.prototype.setSignatureValue = function (signatureValue) {
            return this.signatureValue = signatureValue;
        };


        /*
    Sets the SignatureType and add the envelopedSignature transformation to each reference if nessesary
     */

        SignatureParams.prototype.setSignatureType = function (signatureType) {
            var i, j, ref, results;
            this.signatureType = signatureType;
            if (signatureType === XMLSecEnum.signatureTypesEnum.Enveloped) {
                if (this.references) {
                    results = [];
                    for (i = j = 0, ref = this.references.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                        results.push(this.references[i].setEnvelopedSignatureTransform());
                    }
                    return results;
                }
            }
        };


        /*
    Returns an object wit all information for signature generation
     */

        SignatureParams.prototype.getSignatureParams = function () {
            var signatureParams;
            return signatureParams = {
                signAlgURI: this.signAlgURI,
                signAlg: this.signAlg,
                references: this.references,
                privateKey: this.privateKey,
                publicKey: this.publicKey,
                prefix: this.prefix,
                canonicalisationAlg: this.canonicalisationAlg,
                canonicalisationAlgURI: this.canonicalisationAlgURI,
                signatureValue: this.signatureValue,
                signatureType: this.signatureType
            };
        };

        return SignatureParams;

    })();

}).call(this);

/*
Provides an object with information about the verification process
 */

(function () {
    window.SignatureValidationResults = (function () {
        function SignatureValidationResults() {
            this.result = "";
            this.validatedSignature = "";
            this.validatedReferences = [];
            this.validationErrors = [];
        }


        /*
    Sets the result
    result: true or false
     */

        SignatureValidationResults.prototype.setResult = function (result) {
            return this.result = result;
        };


        /*
    Adds a Validated Reference to the list
    reference: one reference Object
    node: The reference node
    error: An errormassage
     */

        SignatureValidationResults.prototype.addValidatedReference = function (reference, node, error) {
            var validatedReference;
            validatedReference = {
                reference: "",
                node: "",
                error: ""
            };
            validatedReference.reference = reference;
            validatedReference.node = node;
            validatedReference.error = error;
            if (error || error !== "") {
                this.validationErrors.push(error);
            }
            return this.validatedReferences.push(validatedReference);
        };


        /*
    Puts a list of elements into the Variable
    references: A List holding array with[referenceObject, node error]
     */

        SignatureValidationResults.prototype.setReferences = function (references) {
            var i, j, ref;
            for (i = j = 0, ref = references.length - 1; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
                this.addValidatedReference(references[i][0], references[i][1], references[i][2]);
            }
            return this.validatedReferences;
        };


        /*
    Put the signature element in the object
    signature: Signature node
     */

        SignatureValidationResults.prototype.setValidatedSignature = function (signature) {
            return this.validatedSignature = signature;
        };


        /*
    Adds an error to the errorList
    error: Errormassage as string
     */

        SignatureValidationResults.prototype.addValidationErrors = function (error) {
            if (error || error !== "") {
                return this.validationErrors.push(error);
            }
        };


        /*
    returns an Object providing all required information
     */

        SignatureValidationResults.prototype.getResults = function () {
            var results;
            return results = {
                result: this.result,
                validatedReferences: this.validatedReferences,
                validatedSignature: this.validatedSignature,
                validationErrors: this.validationErrors
            };
        };


        /*
    Returns the result
     */

        SignatureValidationResults.prototype.getResult = function () {
            return this.result;
        };


        /*
    Returns a list with all Validation errors
     */

        SignatureValidationResults.prototype.getValidationErrors = function () {
            return this.validationErrors;
        };

        return SignatureValidationResults;

    })();

}).call(this);
(function () {
    if (window.webcryptoImpl == null) {
        window.webcryptoImpl = window.crypto.subtle;
    }

    window.SignedXML = (function () {
        var buildReferenceList, checkForEnveloped, computeSignature, createKeyInfo, createReference, createReferences,
            createSignedInfo, loadReference, loadSignature, preserveSignedInfo, validateReferences,
            validateSignatureValue;

        function SignedXML() {
            var idCount;
            idCount = 0;
        }


        /*
    Computes the Signature and creates the signatureElement
    signedInfo: The signedInfo Element
    signatureParams: The signatureParams object
     */

        computeSignature = function (signedInfo, signatureParams) {
            return new CanonicalXML().canonicalise(signedInfo).then(function (cryptoInput) {
                return CryptoWrapper.Sign(cryptoInput, signatureParams).then(function (signatureValue) {
                    return ElementBuilder.buildSignatureElement(signatureParams.prefix, signedInfo, signatureValue);
                });
            });
        };


        /*
    signes the document.
    doc: The xml document to sign
    signatureParams: SignatureParams object with the required information
     */

        SignedXML.prototype.sign = function (doc, signatureParams) {
            var currentPrefix, prefix, signedInfo;
            prefix = signatureParams.prefix;
            if (prefix) {
                currentPrefix = prefix;
            } else {
                currentPrefix = "";
            }
            return signedInfo = createSignedInfo(doc, signatureParams).then(function (signedInfo) {
                return computeSignature(signedInfo, signatureParams).then(function (signature) {
                    var signatureElement;
                    signatureElement = signature;
                    return createKeyInfo(currentPrefix, signatureParams.publicKey).then(function (keyInfo) {
                        var wrappingElement;
                        if (keyInfo) {
                            signatureElement.appendChild(keyInfo);
                        }
                        if (signatureParams.signatureType === XMLSecEnum.signatureTypesEnum.Enveloped) {
                            doc.documentElement.appendChild(signature);
                        }
                        if (signatureParams.signatureType === XMLSecEnum.signatureTypesEnum.Detached) {
                            wrappingElement = ElementBuilder.buildWrappingElement();
                            wrappingElement.documentElement.appendChild(doc.children[0]);
                            wrappingElement.documentElement.appendChild(signature);
                            doc = wrappingElement;
                        }

                        /*
            if(signatureParams.signatureType == signatureParams.signatureTypesEnum.Enveloping)
              elementBuilder = new ElementBuilder
              signedObject = elementBuilder.buildSignedDataElement(signatureParams.prefix)
              signedObject.documentElement.appendChild(doc.children[0])
              signatureElement.appendChild(keyInfo)
              signatureElement.appendChild(signedObject.children[0])
              doc = signatureElement
             */
                        return doc;
                    });
                });
            });
        };


        /*
    creates the keyInfo element
    prefix: The prefix to use
    key: The public key
     */

        createKeyInfo = function (prefix, key) {
            var algorithm;
            algorithm = key.algorithm.name;
            return window.webcryptoImpl.exportKey("jwk", key).then(function (exportedKey) {
                var exponent, modulus;
                if (algorithm === XMLSecEnum.WebCryptoAlgMapper.RSASHA1.name) {
                    exponent = Helper.base64URLtoBase64(exportedKey.e, exportedKey);
                    modulus = Helper.base64URLtoBase64(exportedKey.n, exportKey);
                    return ElementBuilder.buildRSAKeyInfoElement(prefix, modulus, exponent);
                }
            });
        };


        /*
    creates the reference elements from the reference objects
    doc: The xml document to sign
    signatureParams: SignatureParams object with the required information
     */

        createReferences = function (doc, signatureParams) {
            var i, ref, referenceList, references;
            references = "";
            referenceList = buildReferenceList(doc, signatureParams);
            return Promise.all((function () {
                var k, ref1, results;
                results = [];
                for (i = k = 0, ref1 = referenceList.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; i = 0 <= ref1 ? ++k : --k) {
                    ref = referenceList[i];
                    results.push(createReference(doc, signatureParams, ref).then(function (reference) {
                        return references[i] = reference;
                    }));
                }
                return results;
            })()).then(function (references) {
                return references;
            });
        };


        /*
    Expands the refernce list, if one xpath expression returns more then one node.
    In this case the original reference element is removed and for each resulting node there is a own refence object
    doc: The xml document to sign
    signatureParams: SignatureParams object with the required information
     */

        buildReferenceList = function (doc, signatureParams) {
            var i, idBasedXpath, j, k, l, newReferences, nodes, ref, ref1, ref2, reference;
            newReferences = [];
            reference = "";
            for (i = k = 0, ref1 = signatureParams.references.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; i = 0 <= ref1 ? ++k : --k) {
                ref = signatureParams.references[i];
                nodes = xpath.select(ref.xpath, doc);
                if (nodes.length > 1) {
                    for (j = l = 0, ref2 = nodes.length - 1; 0 <= ref2 ? l <= ref2 : l >= ref2; j = 0 <= ref2 ? ++l : --l) {
                        idBasedXpath = "//*[@id='" + Helper.ensureHasId(nodes[j]) + "']";
                        reference = new Reference(idBasedXpath, ref.transforms, ref.digestAlgURI);
                        newReferences.push(reference);
                    }
                } else if (nodes.length === 1) {
                    idBasedXpath = "//*[@id='" + Helper.ensureHasId(nodes[0]) + "']";
                    reference = new Reference(idBasedXpath, ref.transforms, ref.digestAlgURI);
                    newReferences.push(ref);
                } else if (node.length === 0) {
                    throw new Error("Node not found or invalid xPath:" + ref.xpath);
                }
            }
            return newReferences;
        };


        /*
    Create the reference element
    doc: The xml document to sign
    signatureParams: SignatureParams object with the required information
    ref: The reference object that holds the information for the reference element
     */

        createReference = function (doc, signatureParams, ref) {
            var currentPrefix, i, id, k, nodes, prefix, ref1, transformed;
            prefix = signatureParams.prefix;
            if (prefix) {
                currentPrefix = prefix;
            } else {
                currentPrefix = "";
            }
            nodes = xpath.select(ref.xpath, doc)[0];
            id = Helper.ensureHasId(nodes);
            transformed = nodes;
            for (i = k = 0, ref1 = ref.transforms.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; i = 0 <= ref1 ? ++k : --k) {
                if (Helper.mapFromURI(ref.transforms[i]) === XMLSecEnum.WebCryptoAlgMapper.envelopedSignature) {

                } else if (Helper.mapFromURI(ref.transforms[i]) === XMLSecEnum.WebCryptoAlgMapper.c14n) {
                    return new CanonicalXML().canonicalise(transformed).then(function (transformed) {
                        var digestValue;
                        return digestValue = CryptoWrapper.hash(transformed, ref.digestAlg).then(function (result) {
                            return ElementBuilder.buildReferenceElement(id, signatureParams.prefix, ref.transforms, ref.digestAlgURI, result);
                        }).then(null, function (err) {
                            return console.log(err);
                        });
                    });
                } else {
                    throw new Error("Algorithm not supported");
                }
            }
        };


        /*
    Creates the SignedInfo element
    doc: The xml document to sign
    signatureParams: SignatureParams object with the required information
     */

        createSignedInfo = function (doc, signatureParams) {
            var references, signatureAlg, signedInfos;
            signatureAlg = signatureParams.signatureAlg;
            signedInfos = [];
            return references = createReferences(doc, signatureParams).then(function (ref) {
                return ElementBuilder.buildSignedInfoElement(signatureParams, ref);
            });
        };


        /*
    Loads the SignatureElement from the document and create a SignatureParams object
    xml: The signed XML Document
    SVR: The SignatureValidationResults Object
     */

        loadSignature = function (xml, SVR) {
            var SignatureElement, i, k, loadedReferences, nodes, ref1, referencesToLoad, signature, signatureNode, test;
            if (typeof xml === 'string') {
                signatureNode = utils.parseXML(signatureNode);
            }
            SignatureElement = xpath.select(XMLSecEnum.xPathSelectors.Signature, xml);
            if (!SignatureElement || SignatureElement.length !== 1) {
                throw new error("No or more than one Signature Element detected!");
            }
            SVR.setValidatedSignature(SignatureElement);
            signature = new SignatureParams();
            nodes = xpath.select(XMLSecEnum.xPathSelectors.CanonicalisationAlg, xml);
            if (nodes.length === 0) {
                throw new Error("could not find CanonicalizationMethod/@Algorithm element");
            }
            signature.setCanonicalisationAlgFromURI(nodes[0].value);
            signature.setSigAlgFromURI(utils.findFirst(xml, XMLSecEnum.xPathSelectors.SignatureAlg).value);
            loadedReferences = [];
            referencesToLoad = xpath.select(XMLSecEnum.xPathSelectors.References, xml);
            if (referencesToLoad.length === 0) {
                throw new Error("could not find any Reference elements");
            }
            for (i = k = 0, ref1 = referencesToLoad.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; i = 0 <= ref1 ? ++k : --k) {
                loadedReferences.push(loadReference(referencesToLoad[i]));
            }
            signature.setReferences(loadedReferences);
            signature.setSignatureValue(utils.findFirst(xml, XMLSecEnum.xPathSelectors.SingatureValue).data.replace(/\n/g, ''));
            test = xpath.select(XMLSecEnum.xPathSelectors.Signature, xml)[0];
            test.remove();
            return signature.getSignatureParams();
        };


        /*
    Create reference objects from reference elements
    ref: One reference element
     */

        loadReference = function (ref) {
            var attr, digestAlg, digestAlgo, digestValue, k, nodes, ref1, reference, references, t, transforms,
                transformsAll, transformsNode;
            attr = utils.findAttr(utils.findChilds(ref, XMLSecEnum.NodeNames.digestMethod)[0], XMLSecEnum.AttributeNames.algorithm);
            if (!attr) {
                throw new Error("could not find Algorithm attribute in node " + digestAlgoNode.toString());
            }
            digestAlgo = attr.value;
            nodes = utils.findChilds(ref, XMLSecEnum.NodeNames.digestValue);
            if (nodes.length === 0) {
                throw new Error("could not find DigestValue node in reference " + ref.toString());
            }
            if (nodes[0].childNodes.length === 0 || !nodes[0].firstChild.data) {
                throw new Error("could not find the value of DigestValue in " + nodes[0].toString());
            }
            digestValue = nodes[0].firstChild.data;
            references = [];
            transforms = [];
            nodes = utils.findChilds(ref, XMLSecEnum.NodeNames.transforms);
            if (nodes.length !== 0) {
                transformsNode = nodes[0];
                transformsAll = utils.findChilds(transformsNode, XMLSecEnum.NodeNames.transform);
                for (t = k = 0, ref1 = transformsAll.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; t = 0 <= ref1 ? ++k : --k) {
                    transforms.push(utils.findAttr(transformsAll[t], XMLSecEnum.AttributeNames.algorithm).value);
                }
            }
            digestAlg = Helper.mapFromURI(digestAlgo);
            reference = new Reference(xpath, transforms, digestAlg, utils.findAttr(ref, "URI").value, digestValue);
            return reference;
        };


        /*
    Method called from external to verify a signature Value
    sigXML: Signed Xml document
    publicKey: The verification key

    Returns a SignatureValidationResults object with information about errors, validated References an validated signature
     */

        SignedXML.prototype.verify = function (sigXML, publicKey) {

            /*
      if the passed XML is a string, parse it
       */
            var SVR, isEnveloped, signature, signedInfo, xml;
            xml = utils.parseXML(sigXML);
            if (!xml) {
                xml = sigXML;
            }
            SVR = new SignatureValidationResults();
            signedInfo = preserveSignedInfo(xml);
            signature = loadSignature(xml, SVR);
            isEnveloped = checkForEnveloped(signature.references, signature.signatureTypesEnum);
            if (isEnveloped === false) {
                xml = xml.children[0].firstChild;
            }
            return validateSignatureValue(signedInfo, publicKey, signature).then(function (verifikationResult) {
                SVR.setResult(verifikationResult[0]);
                SVR.addValidationErrors(verifikationResult[1]);
                return validateReferences(xml, signature.references, 0, []).then(function (referenceValidationResult) {
                    SVR.setReferences(referenceValidationResult);
                    if (SVR.getValidationErrors().length > 0) {
                        SVR.setResult(false);
                    } else if (SVR.getResult === true) {
                        SVR.setResult(true);
                    }
                    return SVR.getResults();
                });
            });
        };


        /*
    Checks wether the signature is an enveloped or not by looking at the transformations.
    If it is an enveloped signature there must be an envelopedSignature transformations.
    references: All references form the signed Info
     */

        checkForEnveloped = function (references) {
            var i, isEnveloped, j, k, l, ref1, ref2;
            isEnveloped = false;
            for (i = k = 0, ref1 = references.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; i = 0 <= ref1 ? ++k : --k) {
                for (j = l = 0, ref2 = references[i].transforms.length - 1; 0 <= ref2 ? l <= ref2 : l >= ref2; j = 0 <= ref2 ? ++l : --l) {
                    if (references[i].transforms[j] === XMLSecEnum.AlgIdentifiers.envSig) {
                        isEnveloped = true;
                    }
                }
            }
            return isEnveloped;
        };


        /*
    Saves the signedInfo Element from the signed xml document
    signedXml : The signed xml document
     */

        preserveSignedInfo = function (signedXml) {
            var nodes;
            nodes = xpath.select(XMLSecEnum.xPathSelectors.SignedInfo, signedXml);
            if (!nodes || nodes.length !== 1) {
                return null;
            }
            return nodes[0];
        };


        /*
    Validates the signature value
    signedInfo: The signedInfo element
    publicKey: The verification key
    signature: A signatureParams object
    SVR: The SignatureValidationResults object
     */

        validateSignatureValue = function (signedInfo, publicKey, signature) {
            return new CanonicalXML().canonicalise(signedInfo).then(function (canonXML) {
                return CryptoWrapper.Verify(canonXML, publicKey, signature).then(function (result) {
                    var error;
                    error = "";
                    if (!result) {
                        error = "Signature Value is invalid";
                    }
                    return [result, error];
                });
            });
        };


        /*
    Validates the references reqursive
    doc: The signed xml document
    references : The reference objects
     */

        validateReferences = function (doc, references, i, res) {
            var node, nodes, p, refValRes, transformed, xmlDoc;
            xmlDoc = [doc];
            refValRes = res;
            if (!references[i].uri || references[i].uri === "/*") {
                node = xmlDoc[0];
            } else {
                nodes = xpath.select("//*[@id='" + references[i].uri.substring(1) + "']", doc);
                if (nodes.length > 1) {
                    throw new error("Id is not unique");
                }
                node = nodes[0];
            }
            transformed = node;
            p = new Promise(function (resolve, reject) {
                var k, needWait, ref1, t;
                needWait = false;
                for (t = k = 0, ref1 = references[i].transforms.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; t = 0 <= ref1 ? ++k : --k) {
                    if (Helper.mapFromURI(references[i].transforms[t]) === XMLSecEnum.WebCryptoAlgMapper.c14n) {
                        needWait = true;
                        new CanonicalXML().canonicalise(transformed).then(function (transformed) {
                            return resolve(transformed);
                        });
                    }
                }
                if (!needWait) {
                    return resolve(transformed);
                }
            });
            return p.then(function (transformed) {
                var digestValue;
                return digestValue = CryptoWrapper.hash(transformed, references[i].digestAlg).then(function (result) {
                    var error;
                    error = "";
                    if (result !== references[i].digestValue) {
                        error = "Reference Validation Error of " + references[i].uri;
                    }
                    refValRes.push([references[i], transformed, error]);
                    if (i < references.length - 1) {
                        return validateReferences(doc, references, i + 1, res);
                    } else {
                        return refValRes;
                    }
                });
            });
        };


        /*
    loads the key from the keyInfo element of the signed XML document
    doc: The signedXML document
     */

        SignedXML.prototype.loadKey = function (doc) {
            var exponent, exponentArray, hex, i, k, l, modulus, modulusArray, params, ref1, ref2, xml;
            xml = utils.parseXML(doc);
            if (!xml) {
                xml = doc;
            }
            modulus = utils.findFirst(xml, XMLSecEnum.xPathSelectors.Modulus).data;
            exponent = utils.findFirst(xml, XMLSecEnum.xPathSelectors.Exponent).data;
            params = Helper.mapFromURI(utils.findFirst(xml, XMLSecEnum.xPathSelectors.SignatureAlg).value);
            modulusArray = new Uint8Array(Helper.base64ToArrayBuffer(modulus));
            for (i = k = 0, ref1 = modulusArray.length - 1; 0 <= ref1 ? k <= ref1 : k >= ref1; i = 0 <= ref1 ? ++k : --k) {
                if (modulusArray[0] === 0) {
                    modulusArray = modulusArray.slice(1);
                } else {
                    break;
                }
            }
            modulus = Helper.arrayBufferToBase64(modulusArray);
            modulus = Helper.base64ToBase64URL(modulus);
            exponentArray = new Uint8Array(Helper.base64ToArrayBuffer(exponent));
            for (i = l = 0, ref2 = exponentArray.length - 1; 0 <= ref2 ? l <= ref2 : l >= ref2; i = 0 <= ref2 ? ++l : --l) {
                if (exponentArray[0] === 0) {
                    hex = exponentArray.slice(1);
                } else {
                    break;
                }
            }
            exponent = Helper.arrayBufferToBase64(exponentArray);
            exponent = Helper.base64ToBase64URL(exponent);
            return window.webcryptoImpl.importKey("jwk", {
                kty: params.kty,
                e: exponent,
                n: modulus,
                alg: params.alg,
                ext: true
            }, {
                name: params.name,
                hash: {
                    name: params.hash
                }
            }, false, ["verify"]).then(function (key) {
                return key;
            }).then(null, function (err) {
                return console.log(err);
            });
        };

        return SignedXML;

    })();

}).call(this);
(function () {
    window.XMLSecEnum = (function () {

        /*
    The Namespace URIs
     */
        XMLSecEnum.namespaceURIs = {
            xmlSig: "http://www.w3.org/2000/09/xmldsig#",
            xmlEnc: "http://www.w3.org/2001/04/xmlenc#"
        };


        /*
    Maps the internal Identifier to the WebCryptoAPI Parameters
     */

        XMLSecEnum.WebCryptoAlgMapper = {
            RSASHA1: {
                kty: "RSA",
                alg: "RS1",
                name: "RSASSA-PKCS1-v1_5",
                hash: "SHA-1"
            },
            HMACSHA1: {
                name: "HMAC",
                hash: "SHA-1"
            },
            SHA1: "SHA-1",
            AESCBC: "AES-CBC",
            AESGCM: "AES-GCM",
            c14n: "c14n"
        };


        /*
    Maps a URI to the Internal Identifier. The URI is base64URL encoded
     */

        XMLSecEnum.URIMapper = {
            aHR0cDovL3d3dy53My5vcmcvdHIvMjAwMS9yZWMteG1sLWMxNG4tMjAwMTAzMTU: "c14n",
            aHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3JzYS1zaGEx: "RSASHA1",
            aHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjYWVzMTI4LWNiYw: "AESCBC",
            aHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjYWVzMTkyLWNiYw: "AESCBC",
            aHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjYWVzMjU2LWNiYw: "AESCBC",
            aHR0cDovL3d3dy53My5vcmcvMjAwOS94bWxlbmMjYWVzMTI4LWdjbQ: "AESGCM",
            aHR0cDovL3d3dy53My5vcmcvMjAwOS94bWxlbmMjYWVzMTkyLWdjbQ: "AESGCM",
            aHR0cDovL3d3dy53My5vcmcvMjAwOS94bWxlbmMjYWVzMjU2LWdjbQ: "AESGCM",
            aHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjZWxlbWVudA: "Element",
            aHR0cDovL3d3dy53My5vcmcvMjAwMS8wNC94bWxlbmMjY29udGVudA: "Content",
            aHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI3NoYTE: "SHA1",
            aHR0cDovL3d3dy53My5vcmcvMjAwMC8wOS94bWxkc2lnI2htYWMtc2hhMQ: "HMACSHA1"
        };


        /*
    The Signature Types
     */

        XMLSecEnum.signatureTypesEnum = {
            Enveloped: "Enveloped",
            Detached: "Detached"
        };


        /*
    Maps the internal identifer to the URI
     */

        XMLSecEnum.AlgIdentifiers = {
            AESCBC128: "http://www.w3.org/2001/04/xmlenc#aes128-cbc",
            AESCBC192: "http://www.w3.org/2001/04/xmlenc#aes192-cbc",
            AESCBC256: "http://www.w3.org/2001/04/xmlenc#aes256-cbc",
            AESGCM128: "http://www.w3.org/2009/xmlenc#aes128-gcm",
            AESGCM192: "http://www.w3.org/2009/xmlenc#aes192-gcm",
            AESGCM256: "http://www.w3.org/2009/xmlenc#aes256-gcm",
            RSAOAEP: "http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
            RSASHA1: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
            c14n: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
            envSig: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
            SHA1: "http://www.w3.org/2000/09/xmldsig#sha1",
            HMACSHA1: "http://www.w3.org/2000/09/xmldsig#hmac-sha1"
        };


        /*
    Is a content or an element encrypted
     */

        XMLSecEnum.Type = {
            Element: "Element",
            Content: "Content"
        };


        /*
    The different types of keys supported by the WebCryptoAPI
     */

        XMLSecEnum.KeyTypes = {
            Private: "private",
            Secret: "secret",
            Public: "public"
        };


        /*
    The names of the Nodes that are used for XML Security
     */

        XMLSecEnum.NodeNames = {
            encData: "EncryptedData",
            encMethod: "EncryptionMethod",
            encKey: "EncryptedKey",
            cipherValue: "CipherValue",
            digestMethod: "DigestMethod",
            digestValue: "DigestValue",
            transforms: "Transforms",
            transform: "Transform",
            signature: "Signature",
            signedInfo: "SignedInfo"
        };


        /*
    The names of the Attributes that are used for XML Security
     */

        XMLSecEnum.AttributeNames = {
            type: "Type",
            algorithm: "Algorithm"
        };


        /*
    xPathSelectors for extraction information from the Document
     */

        XMLSecEnum.xPathSelectors = {
            CanonicalisationAlg: ".//*[local-name(.)='CanonicalizationMethod']/@Algorithm",
            SignatureAlg: ".//*[local-name(.)='SignatureMethod']/@Algorithm",
            References: ".//*[local-name(.)='SignedInfo']/*[local-name(.)='Reference']",
            SingatureValue: ".//*[local-name(.)='SignatureValue']/text()",
            Modulus: ".//*[local-name(.)='Modulus']/text()",
            Exponent: ".//*[local-name(.)='Exponent']/text()",
            EncryptedData: "//*[local-name()='EncryptedData']",
            Signature: "//*[local-name()='Signature']",
            SignedInfo: "//*[local-name()='SignedInfo']"
        };

        XMLSecEnum.idAttributes = ["Id", "ID", "id"];

        function XMLSecEnum() {
        }

        return XMLSecEnum;

    })();

}).call(this);
