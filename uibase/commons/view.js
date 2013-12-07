(function(ub) {

    'use strict';

    var updateDepth = 0;

    /**
     * This is the main View class. It is Component that can be rendered.
     *
     * @class View
     * @extends Component
     */
    ub.View = ub.Utils.Class({

        extends: ub.Component,

        /**
         * @constructor
         */
        construct: function(config) {
            var self = this;

            config = config || {};
            self.props = config.props || {};
            self.parent = null;
            self._phase = ub.View.ViewPhase.REMOVED;
            self._futureProps = null;
            self._futureParent = null;
            self._events = config.events || [];

            self.children = config.children;

            self._super();
        },

        /**
         * @method renderView
         * @param depth
         * @returns String
         */
        renderView: function(rootId, depth) {
            var view = this;

            if (view.isRendered()) {
                throw new Error('renderView: Can only render a un-rendered view');
            }

            view._rootId = rootId;
            view._phase = ub.View.ViewPhase.RENDERED;
            view._depth = depth;

            return '';
        },

        updateViewIfRequired: function() {
            this._updateViewIfRequired();
        },

        _updateViewIfRequired: function() {
            if (!this._futureProps) {
                return;
            }

            var prevProps = this.props,
                prevParent = this.parent;

            this.props = this._futureProps;
            this.parent = this._futureParent;
            this._futureProps = null;

            this.updateView(prevProps, prevParent);
        },

        updateView: function(prevProps, prevParent) {
            //TODO: Handle parent reference maintenance
        },

        copyFrom: function(nextView) {
            if (!this.isRendered()) {
                throw new Error('Only a rendered view can be updated');
            }

            this._futureParent = nextView.parent;
            this._futureProps = nextView.props;
            this._updateViewIfRequired();
        },

        removeView: function() {
            if (!this.isRendered()) {
                throw new Error('Can only remove a rendered view');
            }

            var props = this.props;
            //TODO: Handle parent reference maintenance

            this._phase = ub.View.ViewPhase.REMOVED;
        },

        renderChildren: function(childrenToUse) {
            var view = this;
            var index = 0;
            var renderedMarkup = [];
            var children = childrenToUse.reduce(function(result, child, idx) {
                var name = child.getKey(idx);
                result[name] = child;

                return result;
            }, {});

            view._renderedChildren = children;

            for (var name in children) {
                var child = children[name];

                if (children.hasOwnProperty(name) && child) {
                    var renderImage = child.renderView(view._rootId + name, view._depth + 1);

                    child._renderImage = renderImage;
                    child._renderIndex = index;

                    renderedMarkup.push(renderImage);

                    index += 1;
                }
            }

            return renderedMarkup;
        },

        removeChildren: function() {
            var renderedChildren = this._renderedChildren;

            for (var name in renderedChildren) {
                var renderedChild = renderedChildren[name];
                if (renderedChild && renderedChild.removeView) {
                    renderedChild.removeView();
                }
            }

            this._renderedChildren = null;
        },

        updateChildren: function(nextChildren) {
            updateDepth += 1;

            try {
                this._updateChildren(nextChildren);
            } catch (error) {
                updateDepth -= 1;
                updateDepth || this.clearChildUpdateQueue();
                throw error;
            }
            updateDepth--;
            updateDepth || ub.View.processChildUpdateQueue();
        },

        _updateChildren: function(children) {
            var nextChildren = children.reduce(function(result, child, idx) {
                var name = child.getKey(idx);
                result[name] = child;

                return result;
            }, {});
            var prevChildren = this._renderedChildren;

            if (!nextChildren && !prevChildren) {
                return;
            }


            var name;
            // `nextIndex` will increment for each child in `nextChildren`, but
            // `lastIndex` will be the last index visited in `prevChildren`.
            var lastIndex = 0;
            var nextIndex = 0;

            for (name in nextChildren) {
                if (!nextChildren.hasOwnProperty(name)) {
                    continue;
                }

                var prevChild = prevChildren && prevChildren[name];
                var nextChild = nextChildren[name];
                if (prevChild && nextChild &&
                    prevChild.constructor === nextChild.constructor &&
                    prevChild.parent === nextChild.parent) {

                    this.moveChild(prevChild, nextIndex, lastIndex);
                    lastIndex = Math.max(prevChild._renderIndex, lastIndex);
                    prevChild.copyFrom(nextChild);
                    prevChild._renderIndex = nextIndex;
                } else {
                    if (prevChild) {
                        lastIndex = Math.max(prevChild._renderIndex, lastIndex);
                        this.removeChildByName(prevChild, name);
                    }
                    if (nextChild) {
                        this._renderChildByNameAtIndex(nextChild, name, nextIndex);
                    }
                }
                if (nextChild) {
                    nextIndex++;
                }
            }

            for (name in prevChildren) {
                if (prevChildren.hasOwnProperty(name) &&
                    prevChildren[name] &&
                    !(nextChildren && nextChildren[name])) {
                    this.removeChildByName(prevChildren[name], name);
                }
            }
        },

        removeChild: function() {
        },

        moveChild: function (child, toIndex, lastIndex) {
            if (child._renderIndex < lastIndex) {
                this.enqueueMove(this._rootId, child._renderIndex, toIndex);
            }
        },

        removeChildByName: function(child, name) {
            if (child instanceof ub.View) {
                this.removeChild(child);
                child._renderImage = null;
                child._renderIndex = null;
                child.removeView();

                delete this._renderedChildren[name];
            }
        },

        updateTextContent: function(nextContent) {
            updateDepth += 1;

            try {
                var prevChildren = this._renderedChildren;

                for (var name in prevChildren) {
                    if (prevChildren.hasOwnProperty(name) &&
                        prevChildren[name]) {
                        this.removeChildByName(prevChildren[name], name);
                    }
                }

                this.enqueueTextContent(nextContent);
            } catch (error) {
                updateDepth -= 1;
                updateDepth || this.clearChildUpdateQueue();
            }

            updateDepth -= 1;
            updateDepth || ub.View.processChildUpdateQueue();
        },

        enqueueTextContent: function(nextContent) {
            $('[' + ub.View.UBID_ATTR_NAME + '=' + '"' + this._rootId + '"]').text(nextContent);
        },

        getKey: function(index) {
            if (this.props && this.props.key != null) {
                return '{' + this.props.key + '}';
            }

            return '[' + index + ']';
        },

        addInPort: function(name, onNext, onError, onCompleted) {
            var self = this;

            self._inPorts[name] = new ub.Observer(function() {
                onNext.apply(self, arguments);
                self.performUpdateIfRequired();
            });
        },

        isRendered: function() {
            return this._phase === ub.View.ViewPhase.RENDERED;
        },

        static: {

            UBID_ATTR_NAME: 'data-ubid',

            ubId: 5000,

            viewCache: {},

            ViewPhase: {
                RENDERED: 'RENDERED',
                REMOVED: 'REMOVED'
            },

            dirtyViews: [],

            isBatching: false,

            renderView: function(view, container) {
                var markup,
                    rootId = 'ub[' + (ub.View.ubId++).toString(23) + ']';

                ub.View.viewCache[rootId] = rootId;

                markup = view.renderView(rootId, 1);
                $(container).html(markup);

                //view._dom = nextRenderedView;

                return view;
            },

            enqueueUpdate: function(view) {
                ub.View.dirtyViews.push(view);

                if (ub.View.dirtyViews.length === 1 && !ub.View.isBatching) {
                    ub.View.isBatching = true;
                    ub.View.startTicking();
                }
            },

            flushUpdates: function() {
                try {
                    ub.View.runUpdates();
                } catch(e) {
                    throw e;
                } finally {
                    ub.View.clearUpdateQueue();
                }
            },

            clearUpdateQueue: function() {
                ub.View.dirtyViews.length = 0;
                ub.View.isBatching = false;
            },

            runUpdates: function() {
                var views = ub.View.dirtyViews;

                views.sort(function(v1, v2) {
                    return v1._depth - v2._depth;
                });

                for (var i = 0; i < views.length; i++) {
                    var view = views[i];
                    if (view.isRendered()) {
                        view.updateViewIfRequired();
                    }
                }
            },

            startTicking: function() {
                window.requestAnimationFrame(function() {
                    ub.View.flushUpdates();
                });
            },

            processChildUpdateQueue: function() {}
        }
    });

})(window.uibase);
