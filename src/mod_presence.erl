%% @author Marc Worrell <marc@worrell.nl>
%% @copyright 2024-2025 Marc Worrell
%% @doc Simple presence for authenticated users.
%% @end

%% Copyright 2024-2025 Marc Worrell
%%
%% Licensed under the Apache License, Version 2.0 (the "License");
%% you may not use this file except in compliance with the License.
%% You may obtain a copy of the License at
%% 
%%     http://www.apache.org/licenses/LICENSE-2.0
%% 
%% Unless required by applicable law or agreed to in writing, software
%% distributed under the License is distributed on an "AS IS" BASIS,
%% WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
%% See the License for the specific language governing permissions and
%% limitations under the License.

-module(mod_presence).
-moduledoc(#{
    zotonic_keywords => [
        "reference", "frontend_developer", "backend_developer", "module",
        "messaging_and_pubsub", "authorization_and_access_control", "page_lifecycle", "mqtt"
    ]
}).
-moduledoc("
Show who is viewing a shared location using browser presence messages. Enable
`mod_presence` on the site; no module configuration keys are required.
The widgets use Zotonic's widget initialization and Cotonic broker bridge.

## Template usage

Load the widgets and give both widgets the same location identifier:

```django
{% lib \"js/modules/z.presence.js\" \"js/modules/z.presenceview.js\" %}
<span class=\"do_presence do_presenceview\" data-presence-where=\"foo\"></span>
```

`do_presence` publishes the current browser's status. `do_presenceview`
displays the users at that location and can be used on its own. The viewer
also accepts `data-presenceview-where`. Locations are client-chosen strings.
The module includes the scripts in the admin and adds presence indicators
for resource editing and overview lists using `mod_admin/<resource-id>`.
Override `_presence_user.tpl` to customize the user-name fragment.

## Messages and display

The publisher sends QoS 0 messages on
`bridge/origin/presence/status/<where>` with `user_id`, a browser-widget
`unique_id`, `where` and numeric `status`. Viewers request an update on
`bridge/origin/presence/request/<where>`. The publisher checks activity each
second and sends on changes or when more than seven seconds have elapsed.

Status codes are `0` gone, `1` away, `2` idle, `3` present and `4` active.
Activity ages through thresholds of 10, 60 and 300 seconds; page lifecycle
and element removal also feed status changes. Viewers sort by status, hide
gone entries and combine multiple entries for the same user. Present and
active users use `label-success`, idle users `label-info`, and away users
`label-default`. This is transient browser state, not a stored attendance log.

## Topic permissions

The ACL observer handles non-wildcard topics starting with `presence`.
For `presence/<kind>/mod_<name>/...`, it checks `use` permission for that
module; an unknown module atom is denied. Other non-wildcard presence topics
require authentication. These rules apply regardless of the MQTT action.
Wildcard topics and unrelated ACL requests return `undefined` for other ACL
handlers to decide. Presence payloads are supplied by clients; this observer
checks topic access, not the identity fields in those payloads.
").

-mod_author("Marc Worrell <marc@worrell.nl>").
-mod_title("Presence").
-mod_description("View who is where.").
-mod_depends([]).

-export([
    observe_acl_is_allowed/2
]).

-include_lib("zotonic_core/include/zotonic.hrl").

%% @doc Allow access to presence for all authenticated users.
%% The path after 'presence/' can be chosed by the clients.
observe_acl_is_allowed(
    #acl_is_allowed{
        action = _,
        object = #acl_mqtt{
            is_wildcard = false,
            topic = [ <<"presence">>, _, <<"mod_", _/binary>> = Module | _ ]
        }
    }, Context) ->
    try
        ModAsAtom = binary_to_existing_atom(Module),
        z_acl:is_allowed(use, ModAsAtom, Context)
    catch
        _:_ -> false
    end;
observe_acl_is_allowed(
    #acl_is_allowed{
        action = _,
        object = #acl_mqtt{
            topic = [ <<"presence">> | _ ],
            is_wildcard = false
        }
    }, Context) ->
    z_auth:is_auth(Context);
observe_acl_is_allowed(_, _Context) ->
    undefined.
