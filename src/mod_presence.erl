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
