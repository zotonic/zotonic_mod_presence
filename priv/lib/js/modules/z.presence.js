/**
 * @author Marc Worrell <marc@worrell.nl>
 * @copyright 2024 Marc Worrell
 * @doc Advertise that the current user is at a location
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

$.widget("ui.presence", {

    _init: function() {

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

        ////////////////////////////////////////////////////////////////////////////////
        // Model
        //
        var model = {
            element: undefined,
            unique_id: undefined,
            wid: undefined,
            user_id: undefined,
            where: undefined,
            status: STATUS_PRESENT,
            active: 0,
            last_publish: 0
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
            let publish_presence = false;

            // Modify model with data, if acceptable
            data = data || {} ;

            if (data.publish === true) {
                publish_presence = true;
            }

            if (data.unmount === true) {
                if (model.timer) {
                    clearInterval(model.timer);
                }
                cotonic.broker.unsubscribe("model/auth/event/auth", { wid: model.wid });
                cotonic.broker.unsubscribe("model/lifecycle/event/state", { wid: model.wid });
                cotonic.broker.unsubscribe("model/activity/event", { wid: model.wid });
                cotonic.broker.unsubscribe("bridge/origin/presence/request/" + model.where, { wid: model.wid });
                model.element = undefined;
                model.timer = undefined;
                model.status = STATUS_GONE;
                publish_presence = true;
            }

            if (data.ping === true) {
                const inactive_period = now - model.active;
                const old_status = model.status;

                if (inactive_period > AWAY_TIMEOUT) {
                    model.status = STATUS_AWAY;
                } else if (inactive_period > IDLE_TIMEOUT) {
                    model.status = STATUS_IDLE;
                } else if (model.status == STATUS_ACTIVE && inactive_period > ACTIVE_TIMEOUT) {
                    model.status = STATUS_PRESENT;
                }
                if (model.status != old_status) {
                    publish_presence = true;
                }
            }

            if (data.status !== undefined && data.status >= STATUS_PRESENT) {
                model.active = now;
            }

            if (data.status !== undefined && data.status != model.status) {
                if (data.status == STATUS_IDLE) {
                    if (model.status > data.status) {
                        model.status = STATUS_IDLE;
                        publish_presence = true;
                    }
                }
                else if (model.status != STATUS_ACTIVE) {
                    model.status = data.status;
                    publish_presence = true;
                }
            }

            if (model.where !== undefined && (publish_presence || (now - model.last_publish) > PUBLISH_PERIOD)) {
                model.last_publish = now;
                cotonic.broker.publish(
                    "bridge/origin/presence/status/" + model.where,
                    {
                        user_id: model.user_id,
                        unique_id: model.unique_id,
                        where: model.where,
                        status: model.status
                    },
                    { qos: 1 });
            }

            // Render the new view
            state.render(model);
        };


        ////////////////////////////////////////////////////////////////////////////////
        // View
        //
        var view = {} ;

        // Initial State
        view.init = function(model) {
            model.unique_id = unique_id();
            model.active = Date.now() / 1000;
            model.user_id = undefined;
            model.wid = "-presence-" + model.unique_id;

            cotonic.broker.subscribe(
                "bridge/origin/presence/request/" + model.where,
                function(m) {
                    actions.publish();
                },
                { wid: model.wid });

            cotonic.broker.subscribe(
                "model/auth/event/auth",
                function(msg) {
                    model.user_id = msg.payload.user_id;
                },
                { wid: model.wid });

            cotonic.broker.subscribe(
                "model/lifecycle/event/state",
                function(m) {
                    switch(m.payload) {
                        case "active":
                            actions.active();
                            break;
                        case "passive":
                            actions.idle();
                            break;
                        case "hidden":
                        case "frozen":
                            actions.away();
                            break;
                        case "terminated":
                            actions.gone();
                            break;
                        default:
                            break;
                    }
                },
                { wid: model.wid });

            cotonic.broker.subscribe(
                "model/activity/event",
                function(m) {
                    actions.active();
                },
                { wid: model.wid });

            model.timer = setInterval(function() { actions.ping({}); }, 1000);
            return view.ready(model) ;
        } ;

        // State representation of the ready state
        view.ready = function(model) {
            return "";
        };

        // display the state representation
        view.display = function(representation) {
        };

        ////////////////////////////////////////////////////////////////////////////////
        // State
        //
        var state =  { view: view };

        model.state = state ;

        // Derive the current state of the system
        state.idle = function(model) {
           return model.where === undefined;
        };

        state.mounted = function(model) {
            return model.element !== undefined && model.timer !== undefined;
        }

        // Next action predicate, derives whether
        // the system is in a (control) state where
        // an action needs to be invoked

        state.nextAction = function(model) {
            if (state.mounted(model) && !model.element.closest('html')) {
                actions.unmount({});
            }
        };

        state.render = function(model) {
            state.nextAction(model) ;
        };


        ////////////////////////////////////////////////////////////////////////////////
        // Actions
        //

        var actions = {} ;

        actions.unmount = function(_data) {
            model.propose({ unmount: true });
        };

        actions.ping = function(_data) {
            if (!model.element.closest('html')) {
                actions.unmount({});
            } else {
                model.propose({ ping: true });
            }
        };

        actions.idle = function(_data) {
            model.propose({ status: STATUS_IDLE });
        };

        actions.active = function(_data) {
            model.propose({ status: STATUS_ACTIVE });
        };

        actions.gone = function(_data) {
            model.propose({ status: STATUS_GONE });
        };

        actions.away = function(_data) {
            model.propose({ status: STATUS_AWAY });
        };

        actions.publish = function(_data) {
            model.propose({ publish: true });
        };

        ////////////////////////////////////////////////////////////////////////////////
        // Display initial state
        //


        ////////////////////////////////////////////////////////////////////////////////
        // Initialize the model
        //

        const self = this;

        model.element = self.element[0];
        model.where = self.options.where
            || model.element.dataset.presenceWhere;

        view.display(view.init(model)) ;
        state.nextAction(model);
    }
});

$.ui.presence.defaults = {
    where: ''
};
