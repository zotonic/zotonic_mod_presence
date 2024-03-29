# Zotonic presence module

Simple presence indicators for use on pages.

## How to use

Add these javascripts to your lib tag:

```django
{% lib
    "js/modules/z.presence.js"
    "js/modules/z.presenceview.js"
%}
```

To indicate presence at a location at this to your page:

```html
<span class="do_presence" data-presence-where="foo"></span>
```

These attributes could be added to any element.

To show the names of who is present at a page, including their current
active status:

```html
<span class="do_presenceview" data-presence-where="foo"></span>
```

This could also be combined:

```html
<span class="do_presence do_presenceview" data-presence-where="foo"></span>
```

## How it works

The `presence` widget broadcasts the current user's status to the topic:

```
bridge/origin/presence/status/:where
```

The payload is:

```json
{
    "user_id": 1234,
    "unique_id": "fdytwd5wydt76w",
    "where": "foo",
    "status": 1
}
```

The status is one of:

```javascript
const STATUS_GONE    = 0;
const STATUS_AWAY    = 1;
const STATUS_IDLE    = 2;
const STATUS_PRESENT = 3;
const STATUS_ACTIVE  = 4;
```

A user is active if they were typing, scrolling or clicking in the last 10 seconds.

A user is present if they were active less than 60 seconds ago.

A user is idle when they were not active in the last 60 seconds or if the window lost focus.

A user is away if the window is frozen or hidden or if they were not active for more than 300 seconds.

A user is gone if the window is closed or the element is removed.

The status is published on the server topic every status change or 7 seconds.

## What is displayed

The `presenceview` displays a list of usernames.  It uses the template `_presence_view.tpl` to render the
name of the user.

The users are sorted in active status order, most recently active first.

They are displayed wrapped in `<span class="label">...</span>` elements with the following labels:

  * label-success for present and active
  * label-info for idle
  * label-default for all other statuses

