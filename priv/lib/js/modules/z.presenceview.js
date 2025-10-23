/**
 * @author Marc Worrell <marc@worrell.nl>
 * @copyright 2024 Marc Worrell
 * @doc Show a list of users at a specific location.
 *
 * Copyright 2024 Marc Worrell
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

$.widget("ui.presenceview", {

    _init: function() {

        const CALL_TIMEOUT   = 60000;

        const IDLE_TIMEOUT   = 60;
        const AWAY_TIMEOUT   = 300;
        const ACTIVE_TIMEOUT = 10;

        const PUBLISH_PERIOD = 7;
        const GONE_PERIOD    = 20;
        const CLEANUP_PERIOD = 60;

        const STATUS_GONE    = 0;
        const STATUS_AWAY    = 1;
        const STATUS_IDLE    = 2;
        const STATUS_PRESENT = 3;
        const STATUS_ACTIVE  = 4;

        const HTML_PLACEHOLDER = "...";

        ////////////////////////////////////////////////////////////////////////////////
        // Model
        //
        let model = {
            element: undefined,
            is_subscribed: false,
            observer: undefined,
            unique_id: undefined,
            wid: undefined,
            presences: [
                // {
                //     user_id: ...,
                //     unique_id: ...,
                //     last_seen: ...,
                //     status: 2
                // }
            ],
            html: [
            ]
        };

        function unique_id() {
            let t = (new Date()).getTime() + "-";
            const cs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            for (let i=0; i < 20; i++) {
                t += cs.charAt(Math.floor(Math.random() * cs.length));
            }
            return t;
        }

        model.propose = function(data) {
            const now = Math.round(Date.now() / 1000);

            // Modifiy model with data, if acceptable
            data = data || {} ;

            if (data.unmount === true) {
                cotonic.broker.unsubscribe("bridge/origin/presence/status/"+model.where, { wid: model.wid });
                model.is_subscribed = false;
                model.element = undefined;
                if (model.observer) {
                    model.observer.disconnect();
                    model.observer = undefined;
                }
            }

            if (data.subscribe === true && state.unsubscribed(model)) {
                cotonic.broker.subscribe(
                    "bridge/origin/presence/status/"+model.where,
                    function(msg) {
                        actions.presence(msg);
                    },
                    { qos: 0, wid: model.wid });
                model.is_subscribed = true;

                if (model.observer === undefined && model.element !== undefined) {
                    // If Cotonic patches the html then it removes the attribute below.
                    // For us that is the signal to re-render the view (as it has been removed
                    // by Cotonic DOM patching).
                    model.element.setAttribute('presenceview', '1');
                    model.observer = new MutationObserver(() => {
                        setTimeout(() => actions.check(), 100);
                    });
                    model.observer.observe(model.element, { attributes: true });
                }
            }

            if (data.check === true && model.is_subscribed) {
                const newWhere = model.element.dataset.presenceviewWhere
                              || model.element.dataset.presenceWhere;

                if (newWhere && newWhere !== model.where) {
                    cotonic.broker.unsubscribe(
                        "bridge/origin/presence/status/"+model.where,
                        { wid: model.wid });

                    model.where = newWhere;
                    model.presences = [];
                    cotonic.broker.subscribe(
                        "bridge/origin/presence/status/"+model.where,
                        function(msg) {
                            actions.presence(msg);
                        },
                        { qos: 0, wid: model.wid });

                    cotonic.broker.publish(
                        "bridge/origin/presence/request/"+model.where,
                        { unique_id: model.unique_id },
                        { qos: 0 });
                }

                if (model.element.getAttribute('presenceview') !== '1') {
                    model.element.setAttribute('presenceview', '1');
                }
            }

            if (data.request === true) {
                cotonic.broker.publish(
                    "bridge/origin/presence/request/"+model.where,
                    { unique_id: model.unique_id },
                    { qos: 0 });
            }

            for (let ph in model.html) {
                if (ph.html == HTML_PLACEHOLDER) {
                    const p_user_id = ph.user_id;
                    const p_unique_id = ph.unique_id;

                    cotonic.broker.call(
                        "bridge/origin/model/template/get/render/_presence_view.tpl",
                        {
                            user_id: p_user_id,
                            unique_id: p_unique_id
                        },
                        { qos: 0, timeout: CALL_TIMEOUT })
                    .then(function(msg) {
                        const data = {
                            unique_id: p_unique_id,
                            user_id: p_user_id,
                            html: msg.payload.result
                        }
                        actions.presence_html(data);
                    });
                }
            }

            if (data.presence !== undefined && data.presence.where == model.where) {
                let i;

                for (i=0; i<model.presences.length; i++) {
                    if (model.presences[i].unique_id == data.presence.unique_id) {
                        break;
                    }
                }
                if (i == model.presences.length) {
                    var p = {
                        user_id: data.presence.user_id,
                        unique_id: data.presence.unique_id,
                        last_seen: now,
                        status: data.presence.status
                    };
                    model.presences.push(p);
                    if (!(p.unique_id in model.html)) {
                        model.html[p.unique_id] = {
                            user_id: p.user_id,
                            unique_id: p.unique_id,
                            html: HTML_PLACEHOLDER
                        };
                    }
                } else if (data.presence.status == STATUS_GONE && data.presence.unique_id != model.unique_id) {
                    model.presences.splice(i, 1);
                } else {
                    model.presences[i].user_id = data.presence.user_id;
                    model.presences[i].status = data.presence.status;
                    model.presences[i].last_seen = now;
                }
                model.presences = model.presences.filter(function(p) {
                    return p.unique_id == model.unique_id || (now - p.last_seen) < CLEANUP_PERIOD;
                });

                if (model.html[data.presence.unique_id].html == HTML_PLACEHOLDER) {
                    const p_unique_id = data.presence.unique_id;
                    const p_user_id = data.presence.user_id;
                    cotonic.broker.call(
                        "bridge/origin/model/template/get/render/_presence_user.tpl",
                        {
                            user_id: p_user_id,
                            unique_id: p_unique_id
                        },
                        { qos: 0, timeout: CALL_TIMEOUT })
                    .then(function(msg) {
                        const data = {
                            unique_id: p_unique_id,
                            user_id: p_user_id,
                            html: msg.payload.result
                        }
                        actions.presence_html(data);
                    });
                }

                for (i=0; i<model.presences.length; i++) {
                    if (now - model.presences[i].last_seen > GONE_PERIOD) {
                        model.presences[i].status = STATUS_GONE;
                    }
                }
                model.presences.sort(
                        function(a,b) {
                            if (a.status < b.status) return 1;
                            if (a.status > b.status) return -1;
                            return 0;
                        });
            }

            if (data.html !== undefined) {
                model.html[data.unique_id] = {
                    user_id: data.user_id,
                    html: data.html
                };
            }

            // Render the new view
            state.render(model);
        };


        ////////////////////////////////////////////////////////////////////////////////
        // View
        //
        let view = {} ;

        // Initial State
        view.init = function(model) {
            model.unique_id = unique_id();
            model.wid = "-presenceview-" + model.unique_id;
            return view.ready(model) ;
        } ;

        // State representation of the ready state
        view.ready = function(model) {
            const output = state.representation(model);
            return output ;
        };


        // display the state representation
        view.display = function(representation) {
            const stateRepresentation = model.element;
            if (stateRepresentation) {
                stateRepresentation.innerHTML = representation;
            }
        };

        ////////////////////////////////////////////////////////////////////////////////
        // State
        //
        let state =  { view: view };

        model.state = state ;

        // Derive the state representation as a function of the systen
        // control state
        state.representation = function(model) {
            let representation = "";
            let users = [];

            for (let k in model.presences) {
                let p = model.presences[k];
                if (p.status != STATUS_GONE) {
                    if (!p.user_id || !(p.user_id in users)) {
                        let c = 'label-default';
                        switch (model.presences[k].status) {
                            case STATUS_AWAY:
                                break;
                            case STATUS_IDLE:
                                c = 'label-info';
                                break;
                            case STATUS_PRESENT:
                            case STATUS_ACTIVE:
                                c = 'label-success';
                                break;
                        }
                        representation += "<div class='label "+c+"'>"+
                                          (model.html[model.presences[k].unique_id].html || HTML_PLACEHOLDER)+
                                          "</div>";

                        if (p.user_id) {
                            users[p.user_id] = true;
                        }
                    }
                }
            }
            return representation;
        };

        // Derive the current state of the system
        state.idle = function(model) {
           return model.where === undefined;
        };

        state.unsubscribed = function(model) {
           return model.where !== undefined && model.is_subscribed === false;
        };

        state.subscribed = function(model) {
           return model.where !== undefined && model.is_subscribed === true;
        };

        state.mounted = function(model) {
           return model.where !== undefined && model.element !== undefined;
        };

        // Next action predicate, derives whether
        // the system is in a (control) state where
        // an action needs to be invoked

        state.nextAction = function(model) {
            if (state.mounted(model) && !model.element.closest('html')) {
                actions.unmount({});
            }
            else if (state.unsubscribed(model)) {
                actions.subscribe({});
            }
        };

        state.render = function(model) {
            view.display(state.representation(model));
            state.nextAction(model) ;
        };


        ////////////////////////////////////////////////////////////////////////////////
        // Actions
        //

        var actions = {} ;

        actions.unmount = function(_data) {
            model.propose({ unmount: true });
        };

        actions.render = function(_data) {
            model.propose({ render: true });
        };

        actions.check = function(_data) {
            model.propose({ check: true });
        }

        actions.presence = function(msg) {
            let data = {
                presence: {
                    user_id: msg.payload.user_id,
                    where: msg.payload.where,
                    unique_id: msg.payload.unique_id,
                    status: msg.payload.status
                }
            };
            model.propose(data) ;
        };

        actions.presence_html = function(msg) {
            let data = {
                user_id: msg.user_id,
                unique_id: msg.unique_id,
                html: msg.html
            };
            model.propose(data);
        };

        actions.subscribe = function(msg) {
            let data = {
                subscribe: true
            };
            model.propose(data);
        }

        actions.request = function(msg) {
            let data = {
                request: true
            };
            model.propose(data);
        }

        ////////////////////////////////////////////////////////////////////////////////
        // Initialize the model
        // Display initial state
        //

        const self = this;

        model.element = self.element[0];
        model.where = self.options.where
                || model.element.dataset.presenceviewWhere
                || model.element.dataset.presenceWhere;

        view.display(view.init(model)) ;
        state.nextAction(model);

        setTimeout(() => actions.request(), 500);
    }
});

$.ui.presenceview.defaults = {
    where: ''
};
