sc_require("views/view/base");

// When in debug mode, core developers can log the view state.
//@if (debug)
SC.LOG_VIEW_STATES = false;
SC.LOG_VIEW_STATES_STYLE = {
  0x0200: 'color: #67b7db; font-style: italic;', // UNRENDERED
  0x0300: 'color: #67b7db; font-style: italic;', // UNATTACHED
  0x0301: 'color: #67b7db; font-style: italic;', // UNATTACHED_BY_PARENT
  0x03C0: 'color: #23abf5; font-style: italic;', // ATTACHED_SHOWN
  0x03C3: 'color: #1fe7a8; font-style: italic;', // ATTACHED_SHOWN_ANIMATING
  0x03A0: 'color: #67b7db; font-style: italic;', // ATTACHED_HIDDEN
  0x03A1: 'color: #67b7db; font-style: italic;', // ATTACHED_HIDDEN_BY_PARENT
  0x03C1: 'color: #b800db; font-style: italic;', // ATTACHED_BUILDING_IN
  0x0381: 'color: #b800db; font-style: italic;', // ATTACHED_BUILDING_OUT
  0x0382: 'color: #b800db; font-style: italic;', // ATTACHED_BUILDING_OUT_BY_PARENT
  0x03C2: 'color: #b800db; font-style: italic;', // ATTACHED_SHOWING
  0x03A2: 'color: #b800db; font-style: italic;' // ATTACHED_HIDING
};
//@endif


SC.CoreView.mixin(
  /** @scope SC.CoreView */ {

  /**
    The view has been rendered.

    Use a logical AND (single `&`) to test rendered status.  For example,

        view.get('viewState') & SC.CoreView.IS_RENDERED

    @static
    @constant
  */
  IS_RENDERED: 0x0100, // 256

  /**
    The view has been attached.

    Use a logical AND (single `&`) to test attached status.  For example,

        view.get('viewState') & SC.CoreView.IS_ATTACHED

    @static
    @constant
  */
  IS_ATTACHED: 0x0080, // 128

  /**
    The view is visible in the display.

    Use a logical AND (single `&`) to test shown status.  For example,

        view.get('viewState') & SC.CoreView.IS_SHOWN

    @static
    @constant
  */
  IS_SHOWN: 0x0040, // 64

  /**
    The view is invisible in the display.

    Use a logical AND (single `&`) to test hidden status.  For example,

        view.get('viewState') & SC.CoreView.IS_HIDDEN

    @static
    @constant
  */
  IS_HIDDEN: 0x0020, // 32

  /**
    The view has been created, but has not been rendered or attached.

    @static
    @constant
  */
  UNRENDERED: 0x0200, // 512

  /**
    The view has been created and rendered, but has not been attached
    (i.e. appended to the document).

    @static
    @constant
  */
  UNATTACHED: 0x0300, // 768

  /**
    The view has been created and rendered, but an ancestor is not attached.

    @static
    @constant
  */
  UNATTACHED_BY_PARENT: 0x0301, // 769

  /**
    The view has been created, rendered and attached and is visible in the
    display.

    @static
    @constant
  */
  ATTACHED_SHOWN: 0x03C0, // 960

  /**
    The view has been created, rendered and attached, is visible in the
    display and is being animated via a call to `animate()`.

    @static
    @constant
  */
  ATTACHED_SHOWN_ANIMATING: 0x03C3, // 963

  /**
    The view has been created, rendered and attached, but is not visible in the
    display.

    Test with & SC.CoreView.IS_HIDDEN
    @static
    @constant
  */
  ATTACHED_HIDDEN: 0x03A0, // 928

  /**
    The view has been created, rendered and attached, but is not visible in the
    display due to being hidden by a parent view.

    @static
    @constant
  */
  ATTACHED_HIDDEN_BY_PARENT: 0x03A1, // 929

  /**
    The view has been created, rendered and attached and is visible in the
    display.  It is currently transitioning according to the transitionIn
    property before being fully shown (i.e ATTACHED_SHOWN).

    @static
    @constant
  */
  ATTACHED_BUILDING_IN: 0x03C1, // 961

  /**
    The view has been created, rendered and attached.  It is currently
    transitioning according to the transitionOut property before being
    detached (i.e. removed from the document).

    @static
    @constant
  */
  ATTACHED_BUILDING_OUT: 0x0381, // 897

  /**
    The view has been created, rendered and attached.  It is currently
    transitioning according to the transitionOut property before being
    detached (i.e. removed from the document) because a parent view is
    being detached.

    @static
    @constant
  */
  ATTACHED_BUILDING_OUT_BY_PARENT: 0x0382, // 898

  /**
    The view has been created, rendered and attached and is visible in the
    display.  It is currently transitioning according to the transitionShow
    property before being fully shown (i.e ATTACHED_SHOWN).

    @static
    @constant
  */
  ATTACHED_SHOWING: 0x03C2, // 962

  /**
    The view has been created, rendered and attached.  It is currently
    transitioning according to the transitionHide property before being fully
    hidden.

    @static
    @constant
  */
  ATTACHED_HIDING: 0x03A2 // 930

});


SC.CoreView.reopen(
  /** @scope SC.CoreView.prototype */ {

  //@if(debug)
  /* BEGIN DEBUG ONLY PROPERTIES AND METHODS */

  /** @private Creates string representation of view, with view state. */
  toString: function () {
    return "%@ (%@)".fmt(sc_super(), this._viewStateString());
  },

  /** @private Creates string representation of view state.  */
  _viewStateString: function () {
    var ret = [], state = this.get('viewState');

    for (var prop in SC.CoreView) {
      if (prop.match(/[A-Z_]$/) && SC.CoreView[prop] === state) {
        ret.push(prop);
      }
    }

    return ret.join(" ");
  },

  /* END DEBUG ONLY PROPERTIES AND METHODS */
  //@endif

  // ------------------------------------------------------------------------
  // Properties
  //

  /* @private Internal variable used to store the number of children building out while we wait to be detached. */
  _buildingOutCount: null,

  /* @private Internal variable used to track the original view being detached that we are delaying so that we can build out. */
  _owningView: null,

  /* @private Internal variable used to store the original layout before running an automatic transition. */
  _preTransitionLayout: null,

  /* @private Internal variable used to store the original frame before running an automatic transition. */
  _preTransitionFrame: null,

  /* @private Internal variable used to cache layout properties which must be reset after the transition. */
  _transitionLayoutCache: null,

  /**
    The current state of the view as managed by its internal statechart.

    In order to optimize the behavior of SC.View, such as only observing display
    properties when in a rendered state or queueing updates when in a non-shown
    state, SC.View includes a simple internal statechart that maintains the
    current state of the view.

    Views have several possible states:

    * SC.CoreView.UNRENDERED
    * SC.CoreView.UNATTACHED
    * SC.CoreView.UNATTACHED_BY_PARENT
    * SC.CoreView.ATTACHED_SHOWING
    * SC.CoreView.ATTACHED_SHOWN
    * SC.CoreView.ATTACHED_SHOWN_ANIMATING
    * SC.CoreView.ATTACHED_HIDING
    * SC.CoreView.ATTACHED_HIDDEN
    * SC.CoreView.ATTACHED_HIDDEN_BY_PARENT
    * SC.CoreView.ATTACHED_BUILDING_IN
    * SC.CoreView.ATTACHED_BUILDING_OUT
    * SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT

    @type String
    @default SC.CoreView.UNRENDERED
    @readonly
  */
  viewState: SC.CoreView.UNRENDERED,

  /**
    Whether the view's layer is attached to the document or not.

    When the view's layer is attached to the document, this value will be true.

    @field
    @type Boolean
    @default false
    @readonly
  */
  isAttached: function () {
    var state = this.get('viewState');
    return state & SC.CoreView.IS_ATTACHED;
  }.property('viewState').cacheable(),

  /** @private
    Whether the view's layer exists or not.

    When the view's layer is created, this value will be true.  This includes
    the unattached view state and all of the attached states.

    @field
    @type Boolean
    @default false
    @readonly
  */
  // NOTE: This property is of little value, so it's private in case we decide to toss it.
  _isRendered: function () {
    return this.get('viewState') !== SC.CoreView.UNRENDERED;
  }.property('viewState').cacheable(),

  /**
    Whether the view is fully or becoming shown or not.

    When the view is shown in the window, this value will be true.  Note that
    if the view is transitioning out or hiding, this value will still be true.

    This is not necessarily the same as `isVisible` although the two properties
    are related.  For instance, it's possible to set `isVisible` to `true` and
    still have `isVisibleInWindow` be `false` or vice versa due to the
    `isVisibleInWindow` state of the view's parent view.  Therefore,
    `isVisibleInWindow` represents the actual visible state of the view and
    `isVisible` is used to attempt to alter that state.

    @field
    @type Boolean
    @default false
    @readonly
  */
  isVisibleInWindow: function () {
    var state = this.get('viewState');
    return state & SC.CoreView.IS_ATTACHED &&
      state !== SC.CoreView.ATTACHED_HIDDEN &&
      state !== SC.CoreView.ATTACHED_HIDDEN_BY_PARENT;
  }.property('viewState').cacheable(),


  // ------------------------------------------------------------------------
  // Actions (Locked down to the proper state)
  //

  /** @private Adopt this view action. */
  _doAdopt: function (parentView, beforeView) {
    var curParentView = this.get('parentView'),
      handled = true;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doAdopt(%@, %@)'.fmt(this, parentView, beforeView), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    if (curParentView && curParentView !== parentView) {
      //@if(debug)
      // This should be avoided, because using the same view instance without explicitly orphaning it first is a dangerous practice.
      SC.warn("Developer Warning: You should not adopt the view, %@, to a new parent without removing it from its old parent first.".fmt(this));
      //@endif

      // Force orphaning the view.
      this._doOrphan();
      curParentView = false;
    }

    // You can adopt childViews that have you set as their parent (i.e. created
    // with createChildView()), but have not yet been fully adopted.
    if (!curParentView || this.get('childViews').indexOf(this) < 0) {
      var idx,
        childViews = parentView.get('childViews'),
        parentViewState = parentView.get('viewState'),
        parentNode, nextNode, nextView, siblings;

      // Notify that the child view will be added to the parent view.
      if (parentView.willAddChild) { parentView.willAddChild(this, beforeView); }
      if (this.willAddToParent) { this.willAddToParent(parentView, beforeView); }

      // Set the parentView.
      this.set('parentView', parentView);

      // Add to the new parent's childViews array.
      if (childViews.needsClone) { parentView.set(childViews = []); }
      idx = (beforeView) ? childViews.indexOf(beforeView) : childViews.length;
      if (idx < 0) { idx = childViews.length; }
      childViews.insertAt(idx, this);

      // Pass the current designMode to the view (and its children).
      this.updateDesignMode(this.get('designMode'), parentView.get('designMode'));

      // Notify adopted.
      this._adopted(beforeView);

      // When a view is adopted, it should go to the same state as its new parent.
      switch (this.get('viewState')) {
      case SC.CoreView.UNRENDERED:
        switch (parentViewState) {
        case SC.CoreView.UNRENDERED:
          break;
        default:
          // Bypass the unrendered state for adopted views.
          this._doRender();
        }
        break;
      case SC.CoreView.UNATTACHED:
        switch (parentViewState) {
        case SC.CoreView.UNRENDERED:
          // Bring the child view down to the state of the parent.
          this._doDestroyLayer();
          break;
        default:
          parentNode = parentView.get('containerLayer');
          siblings = parentView.get('childViews');
          nextView = siblings.objectAt(siblings.indexOf(this) + 1);
          nextNode = (nextView) ? nextView.get('layer') : null;

          this._doAttach(parentNode, nextNode);
        }
        break;
      default: // ATTACHED_X
        switch (parentViewState) {
        case SC.CoreView.UNRENDERED:
          // Bring the child view down to the state of the parent.
          this._doDestroyLayer();
          break;
        default:
          parentNode = parentView.get('containerLayer');
          siblings = parentView.get('childViews');
          nextView = siblings.objectAt(siblings.indexOf(this) + 1);
          nextNode = (nextView) ? nextView.get('layer') : null;

          this._doAttach(parentNode, nextNode);
        }
      }
    } else {
      handled = false;
    }

    return handled;
  },

  /** @private Attach this view action. */
  _doAttach: function (parentNode, nextNode) {
    var state = this.get('viewState'),
      transitionIn = this.get('transitionIn'),
      parentView,
      isHandled = false;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doAttach(%@, %@)'.fmt(this, parentNode, nextNode), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    switch (state) {

    // Normal case: view is not attached and is being attached.
    case SC.CoreView.UNATTACHED:
      var node = this.get('layer');

      this._executeQueuedUpdates();

      // Attach to parentNode.
      // IE doesn't support insertBefore(blah, undefined) in version IE9.
      parentNode.insertBefore(node, nextNode || null);

      parentView = this.get('parentView');
      if (!parentView || (parentView && parentView.get('isAttached'))) {
        // Attach the view.
        this._executeDoAttach();

        // If there is a transition in, run it.
        if (transitionIn) {
          this._transitionIn(false);
        }
      } else {
        // Attaching an unattached view to an unattached view, simply moves it to unattached by
        // parent state. Don't do any notifications.
        this._gotoUnattachedByParentState();
      }

      isHandled = true;
      break;

    // Special case: view switched from building out to building in.
    case SC.CoreView.ATTACHED_BUILDING_OUT:
      // If already building out, we need to cancel and possibly build in. Top-down so that any
      // children that are hidden or building out on their own allow us to bail out early.
      this._callOnChildViews('_parentDidCancelBuildOut');

      // Remove the shared building out count if it exists.
      this._buildingOutCount = null;

      // Note: We can be in ATTACHED_BUILDING_OUT state without a transition out while we wait for child views.
      if (this.get('transitionOut')) {
        // Cancel the building out transition (in place if we are going to switch to transitioning back in).
        this.cancelAnimation(transitionIn ? SC.LayoutState.CURRENT : undefined);

        // Set the proper state.
        this._gotoAttachedShownState();

        if (transitionIn) {
          this._transitionIn(true);
        }

      // Waiting for child view transition outs.
      } else {

        // Set the proper state.
        this._gotoAttachedShownState();
      }

      isHandled = true;
      break;

    // Invalid states that have no effect.
    case SC.CoreView.ATTACHED_HIDING:
    case SC.CoreView.ATTACHED_HIDDEN:
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT:
    case SC.CoreView.ATTACHED_BUILDING_IN:
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT:
    case SC.CoreView.ATTACHED_SHOWING:
    case SC.CoreView.UNRENDERED:
      break;

    // Improper states that have no effect, but should be discouraged.
    case SC.CoreView.ATTACHED_SHOWN:
    case SC.CoreView.ATTACHED_SHOWN_ANIMATING:
      //@if(debug)
      if (parentNode !== this.getPath('parentView.layer')) {
        // This should be avoided, because moving the view layer without explicitly removing it first is a dangerous practice.
        SC.warn("Developer Warning: You can not attach the view, %@, to a new node without properly detaching it first.".fmt(this));
      }
      //@endif
      break;
    case SC.CoreView.UNATTACHED_BY_PARENT:
      //@if(debug)
      SC.warn("Developer Warning: You can not attach the child view, %@, directly.".fmt(this));
      //@endif
      break;
    }

    return isHandled;
  },

  /** @private Destroy the layer of this view action. */
  _doDestroyLayer: function () {
    var state = this.get('viewState'),
      isHandled = false;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doDestroyLayer()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    switch (state) {

    // Invalid states that have no effect.
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.ATTACHED_HIDING:
    case SC.CoreView.ATTACHED_HIDDEN:
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT:
    case SC.CoreView.ATTACHED_BUILDING_IN:
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT:
    case SC.CoreView.ATTACHED_SHOWING:
    case SC.CoreView.ATTACHED_SHOWN:
    case SC.CoreView.ATTACHED_SHOWN_ANIMATING:
    case SC.CoreView.UNATTACHED_BY_PARENT:
    case SC.CoreView.ATTACHED_BUILDING_OUT:
      break;

    // Normal case (SC.CoreView.UNATTACHED): view is rendered and its layer is being destroyed.
    default:
      // Notify that the layer will be destroyed. Bottom-up so that each child is in the proper
      // state before its parent potentially alters its state. For example, a parent could modify
      // children in `willDestroyLayer`.
      // this._callOnChildViews('_notifyWillDestroyLayer', false);
      // this._notifyWillDestroyLayer();

      // Remove all layer references. Bottom-up, there's no chance to bail out early.
      this._callOnChildViews('_teardownLayer', false);
      this._teardownLayer();

      isHandled = true;
    }

    return isHandled;
  },

  /** @private Detach this view action. */
  _doDetach: function (immediately) {
    var state = this.get('viewState'),
      transitionOut = this.get('transitionOut'),
      inPlace = false,
      isHandled = true;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doDetach()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    switch (state) {

    // Normal case: Attached visible view being detached.
    case SC.CoreView.ATTACHED_SHOWN:
      break;

    // Normal case: Attached non-visible view being detached.
    case SC.CoreView.UNATTACHED_BY_PARENT:
    case SC.CoreView.ATTACHED_HIDDEN:
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT:
      // No need to transition out, since we're hidden.
      immediately = true;
      break;

    // Near normal case: Attached visible view that is in the middle of an animation.
    case SC.CoreView.ATTACHED_SHOWN_ANIMATING:
      this.cancelAnimation();
      break;

    // Near normal case: Attached showing view. We cancel the incoming animation
    // rather than swapping to a build out (difficult to get right, because we lose track of the correct final layout).
    case SC.CoreView.ATTACHED_SHOWING:
      this.cancelAnimation(); // Fires didTransitionIn callback (state changes to ATTACHED_SHOWN/notifications sent).
      break;

    // Near normal case: Attached hiding view. We cancel the outgoing animation
    // rather than swapping to a build out (difficult to get right, because we lose track of the correct final layout).
    case SC.CoreView.ATTACHED_HIDING:
      this.cancelAnimation(); // Fires didTransitionOut callback (state changes to ATTACHED_HIDDEN/notifications sent).

      // No need to transition out, since we're hidden.
      immediately = true;
      break;

    // Near normal case: Attached building in view. We cancel the incoming
    // animation and build out the view in place.
    case SC.CoreView.ATTACHED_BUILDING_IN:
      if (immediately || !transitionOut) {
        this.cancelAnimation(); // Fires didTransitionIn callback (state changes to ATTACHED_SHOWN/notifications sent).
      } else {
        // Set the state manually so the callback doesn't do clean up and notify.
        this._gotoAttachedShownState();

        // Cancel the animation in place (setup properties still exist and will be cleared by transitionOut)
        this.cancelAnimation(SC.LayoutState.CURRENT); // Fires didTransitionIn callback (no state change/no notifications).

        // Transition out in place.
        inPlace = true;
      }
      break;

    // Special case: Already building out, because parent is building out. Stop
    // the transition in place so that it can continue in place on its own.
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT: // FAST PATH!
      // Note: *will* detach notice already sent.
      this.cancelAnimation(SC.LayoutState.CURRENT); // Fires didTransitionOut callback (necessary to clean up parent view build out wait)

      // Switch state to regular state (the view should only have been able to get to ATTACHED_BUILDING_OUT_BY_PARENT from ATTACHED_SHOWN).
      this._gotoAttachedShownState();

      // TODO: Grab the build out count for all child views of this view. What a nightmare for an edge case!

      // Transition out in place.
      inPlace = true;

      break;

    // Special case: Already building out. Fast path!
    case SC.CoreView.ATTACHED_BUILDING_OUT:
      // If immediately is passed, cancel the build out prematurely.
      if (immediately) {
        // Note: *will* detach notice already sent.
        this.cancelAnimation(); // Fires didTransitionOut callback (state changes to UNATTACHED/notifications sent).

        // Detach immediately.
        this._executeDoDetach();
      }

      // Don't try to notify or run transition out code again.
      return true;

    // Invalid states that have no effect. Fast path!
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.UNATTACHED:
      return false;
    }

    // Notify *will* (top-down from parent to children). The children will be
    // notified only when they are actually about to be removed.
    // this._notifyWillDetach();

    if (immediately) {
      // Detach immediately.
      this._executeDoDetach();
    } else {
      // In order to allow the removal of a parent to be delayed by children's
      // transitions, we track which views are building out and finish
      // only when they're all done.
      this._buildingOutCount = 0;

      // Tell all the child views so that any with a transitionOut may run it. Top-down so that
      // any hidden or already building out child views allow us to bail out early.
      this._callOnChildViews('_parentWillBuildOutFromDocument', true, this);

      if (transitionOut) {
        // this.invokeNext(function () {
          this._transitionOut(inPlace, this);
        // });

        // Update states after *will* and before *did* notifications!
        this._gotoAttachedBuildingOutState();
      } else if (this._buildingOutCount > 0) {
        // Some children are building out, we will have to wait for them.
        this._gotoAttachedBuildingOutState();
      } else {
        this._buildingOutCount = null;

        // Detach immediately.
        this._executeDoDetach();
      }
    }

    return isHandled;
  },

  /** @private Hide this view action. */
  _doHide: function () {
    var state = this.get('viewState'),
      transitionHide = this.get('transitionHide'),
      shouldHandle = true;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doHide()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The view is shown.
    // Result: Notify that the view will hide and then either hide or run hide transition.
    case SC.CoreView.ATTACHED_SHOWN:
    case SC.CoreView.ATTACHED_BUILDING_OUT:
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT:
    case SC.ATTACHED_BUILDING_IN:
    case SC.CoreView.ATTACHED_SHOWN_ANIMATING:
    // ATTACHED_HIDDEN_BY_PARENT, ATTACHED_BUILDING_IN, ATTACHED_BUILDING_OUT_BY_PARENT, ATTACHED_BUILDING_OUT

      if (transitionHide) {
        // this.invokeNext(function () {
          this._transitionHide();
        // });
      } else {
        // Hide the view.
        this._executeDoHide();
      }

      break;

    // Scenario: The view was showing at the time it was told to hide.
    // Result: Cancel the animation.
    case SC.CoreView.ATTACHED_SHOWING:
      this.cancelAnimation(SC.LayoutState.CURRENT);

      // Set the proper state.
      this._gotoAttachedShownState();

      shouldHandle = this._doHide();

      break;

    // Scenario: The view is rendered but is not attached.
    // Result: Queue an update to the visibility style.
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.UNATTACHED_BY_PARENT:
      // Queue the visibility update for the next time we display.
      this._visibleStyleNeedsUpdate = true;

      break;

    // Scenario: The view is not even rendered.
    // Result: Nothing is required.
    case SC.CoreView.UNRENDERED:
      shouldHandle = false;
      break;

    case SC.CoreView.ATTACHED_HIDDEN: // FAST PATH!
    case SC.CoreView.ATTACHED_HIDING: // FAST PATH!
      return false;
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT: // FAST PATH!
    case SC.CoreView.ATTACHED_BUILDING_OUT: // FAST PATH!
      // Queue the visibility update for the next time we display.
      this._visibleStyleNeedsUpdate = true;

      return true;
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT: // FAST PATH!
      // Note that visibility update is NOT conditional for this state.
      this._doUpdateVisibleStyle();

      // Update states after *will* and before *did* notifications!
      this._gotoAttachedHiddenState();

      return true;
    case SC.CoreView.ATTACHED_BUILDING_IN:

    // Near normal case: Attached visible view that is in the middle of an animation.
    case SC.CoreView.ATTACHED_SHOWN_ANIMATING:
      this.cancelAnimation();
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart code is being improperly used.
      // Telling the view to hide when it is already hidden isn't correct:
      //
      SC.warn("Developer Warning: Called _doShow on view in invalid state, %@.".fmt(this._viewStateString()));
      //@endif

      shouldHandle = false;
    }

    return shouldHandle;
  },

  /** @private Orphan this view action. */
  _doOrphan: function () {
    var parentView = this.get('parentView'),
      handled = true;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doOrphan()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    if (parentView) {
      var childViews = parentView.get('childViews'),
        idx = childViews.indexOf(this);

      // Completely remove the view from its parent.
      this.set('parentView', null);

      // Remove view from old parent's childViews array.
      if (idx >= 0) { childViews.removeAt(idx); }

      // Notify orphaned.
      this._orphaned(parentView);
    } else {
      handled = false;
    }

    return handled;
  },

  /** @private Render this view action. */
  _doRender: function () {
    var state = this.get('viewState'),
        shouldHandle = true;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doRender()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The view is not rendered.
    // Result: Render the layer and then notify.
    case SC.CoreView.UNRENDERED:
      // Render the view.
      this._executeDoRender();

      // Bypass the unattached state for adopted views.
      var parentView = this.get('parentView');
      if (parentView && parentView.get('_isRendered')) {
        var parentNode = parentView.get('containerLayer'),
          siblings = parentView.get('childViews'),
          nextView = siblings.objectAt(siblings.indexOf(this) + 1),
          nextNode = (nextView) ? nextView.get('layer') : null;

        // Attach to parentNode
        // IE doesn't support insertBefore(blah, undefined) in version IE9.
        // parentNode.insertBefore(node, nextNode || null);
        this._doAttach(parentNode, nextNode);
      }

      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart code is being improperly used.
      // All other states should be impossible if parent was UNATTACHED:
      // ATTACHED_SHOWING, ATTACHED_SHOWN, ATTACHED_SHOWN_ANIMATING, ATTACHED_HIDING, ATTACHED_HIDDEN, ATTACHED_HIDDEN_BY_PARENT, ATTACHED_BUILDING_IN, ATTACHED_BUILDING_OUT, ATTACHED_BUILDING_OUT_BY_PARENT, UNATTACHED, UNATTACHED_BY_PARENT
      SC.warn("Developer Warning: Called _doRender on view in invalid state, %@.".fmt(this._viewStateString()));
      //@endif
      shouldHandle = false;
    }

    return shouldHandle;
  },

  /** @private Show this view action. */
  _doShow: function () {
    var state = this.get('viewState'),
        transitionShow = this.get('transitionShow'),
        shouldHandle = true;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doShow()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The view is hidden.
    // Result: Depends on whether the parent view is shown or hidden by an ancestor.
    case SC.CoreView.ATTACHED_HIDDEN:
      var parentView = this.get('parentView'),
          // Views without a parent are not limited by a parent's current state.
          isParentShown = parentView ? parentView.get('viewState') & SC.CoreView.IS_SHOWN : true;

      // Scenario: The view is hidden and its ancestors are all visible.
      // Result: Notify that the view and relevant child views will be shown.
      if (isParentShown) {
        var notifyStack = []; // Only those views that changed state get added to the stack.

        // Run any queued updates.
        this._executeQueuedUpdates();

        // The children are updated top-down so that hidden or unattached children allow us to bail out early.
        this._callOnChildViews('_parentWillShowInDocument', true, notifyStack);

        // Notify for each child (that will change state) in reverse so that each child is in the proper
        // state before its parent potentially alters its state. For example, a parent could modify
        // children in `willShowInDocument`.
        // UNUSED: Is it necessary for hiding/showing of a view to notify entire descendent tree?
        // for (var i = notifyStack.length - 1; i >= 0; i--) {
        //   var childView = notifyStack[i];

        //   childView._notifyWillShowInDocument();
        // }
        this._notifyWillShowInDocument();

        // Show the view.
        this._executeDoShow();
        if (transitionShow) {
          this._transitionShow(false);
        }

      // Scenario: The view is hidden, but one of its ancestors is also hidden.
      // Result: Track that the visible style needs update and go to hidden by parent state.
      } else {
        // Queue the visibility update for the next time we display.
        this._visibleStyleNeedsUpdate = true;

        // Set the proper state.
        this._gotoAttachedHiddenByParentState();
      }

      break;

    // Scenario: The view was hiding at the time it was told to show.
    // Result: Revert or reverse the hiding transition.
    case SC.CoreView.ATTACHED_HIDING:
      // Cancel the hiding transition (in place if we are going to switch to transitioning back in).
      this.cancelAnimation(transitionShow ? SC.LayoutState.CURRENT : SC.LayoutState.START);

      // Set the proper state.
      this._gotoAttachedShownState();

      if (transitionShow) {
        this._transitionShow(true);
      }

      break;

    // Scenario: The view is rendered but is not attached.
    // Result: Queue an update to the visibility style.
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.UNATTACHED_BY_PARENT:
      // Queue the visibility update for the next time we display.
      this._visibleStyleNeedsUpdate = true;

      break;

    // Scenario: The view is not even rendered.
    // Result: Nothing is required.
    case SC.CoreView.UNRENDERED:
      shouldHandle = false;
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart code is being improperly used.
      // Telling the view to show when it is already visible isn't correct:
      // ATTACHED_SHOWN, ATTACHED_SHOWN_ANIMATING, ATTACHED_SHOWING, ATTACHED_HIDDEN_BY_PARENT, ATTACHED_BUILDING_IN, ATTACHED_BUILDING_OUT_BY_PARENT, ATTACHED_BUILDING_OUT
      SC.warn("Developer Warning: Called _doShow on view in invalid state, %@.".fmt(this._viewStateString()));
      //@endif

      shouldHandle = false;
    }

    return shouldHandle;
  },

  /** @private Update this view's contents action. */
  _doUpdateContent: function (force) {
    var isVisibleInWindow = this.get('isVisibleInWindow'),
      handled = true;

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _doUpdateContent(%@)'.fmt(this, force), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    if (this.get('_isRendered')) {
      if (isVisibleInWindow || force) {
        // Only in the visible states do we allow updates without being forced.
        this._executeDoUpdateContent();
      } else {
        // Otherwise mark the view as needing an update when we enter a shown state again.
        this._contentNeedsUpdate = true;
      }
    } else {
      handled = false;
    }

    return handled;
  },

  // ------------------------------------------------------------------------
  // Events
  //

  /**
    This method is called by transition plugins when the incoming or showing
    transition completes.  You should only use this method if implementing a
    custom transition plugin.

    @param {SC.ViewTransitionProtocol} transition The transition plugin used.
    @param {Object} options The original options used.  One of transitionShowOptions or transitionInOptions.
  */
  didTransitionIn: function () {
    var state = this.get('viewState');

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — didTransitionIn()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    if (state === SC.CoreView.ATTACHED_SHOWING ||
      state === SC.CoreView.ATTACHED_BUILDING_IN) {
      this._teardownTransition();

      // Show the view.
      // this._executeDoShow();
      // Set the proper state.
      this._gotoAttachedShownState();
    }
  },

  /**
    This method is called by transition plugins when the outgoing or hiding
    transition completes.  You should only use this method if implementing a
    custom transition plugin.

    @param {SC.ViewTransitionProtocol} transition The transition plugin used.
    @param {Object} options The original options used.  One of transitionHideOptions or transitionOutOptions.
  */
  didTransitionOut: function () {
    var state = this.get('viewState');

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — didTransitionOut()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    if (state === SC.CoreView.ATTACHED_BUILDING_OUT) {
      this._teardownTransition();

      this._executeDoDetach();
    } else if (state === SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT) {
      var owningView = this._owningView;
      // We can't clean up the transition until the parent is done.  For
      // example, a fast child build out inside of a slow parent build out.
      owningView._buildingOutCount--;

      if (owningView._buildingOutCount === 0) {
        owningView._executeDoDetach();

        // Clean up.
        this._owningView = null;
      }
    } else if (state === SC.CoreView.ATTACHED_HIDING) {
      this._teardownTransition();

      // Cancel any remaining animations (i.e. a build in or build out that was left running at the same time).
      this.cancelAnimation(SC.LayoutState.CURRENT);

      // Allow children to notify that they will be hidden. Bottom-up so that each child is in the
      // proper state before its parent potentially alters its state. For example, a parent could
      // modify children in `willHideInDocument`.
      // this._callOnChildViews('_notifyWillHideInDocument');

      // Hide immediately.
      this._executeDoHide();
    }
  },

  /** @private The 'adopted' event. */
  _adopted: function (beforeView) {
    // Notify all of our descendents that our parent has changed. They will update their `pane` value
    // for one. Bottom-up in case a parent view modifies children when its pane changes for any
    // reason.
    this._callOnChildViews('_ancestorDidChangeParent', false);

    // Notify that the child view has been added to the parent view.
    var parentView = this.get('parentView');
    if (this.didAddToParent) { this.didAddToParent(parentView, beforeView); }
    if (parentView.didAddChild) { parentView.didAddChild(this, beforeView); }
  },

  /** @private The 'orphaned' event. */
  _orphaned: function (oldParentView) {
    // It's not necessary to send notice to destroyed views.
    if (!this.isDestroyed) {
      // Notify all of our descendents that our parent has changed. They will update their `pane` value
      // for one. Bottom-up in case a parent view modifies children when its pane changes for any
      // reason.
      this._callOnChildViews('_ancestorDidChangeParent', false);

      if (oldParentView.didRemoveChild) { oldParentView.didRemoveChild(this); }
      if (this.didRemoveFromParent) { this.didRemoveFromParent(oldParentView); }
    }
  },

  // ------------------------------------------------------------------------
  // States
  //

  /** @private */
  _gotoAttachedBuildingInState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_BUILDING_IN);
  },

  /** @private */
  _gotoAttachedBuildingOutState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_BUILDING_OUT);
  },

  /** @private */
  _gotoAttachedBuildingOutByParentState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT);
  },

  /** @private */
  _gotoAttachedHiddenState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_HIDDEN);
  },

  /** @private */
  _gotoAttachedHiddenByParentState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_HIDDEN_BY_PARENT);
  },

  /** @private */
  _gotoAttachedHidingState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_HIDING);
  },

  /** @private */
  _gotoAttachedShowingState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_SHOWING);
  },

  /** @private */
  _gotoAttachedShownState: function () {
    this.set('viewState', SC.CoreView.ATTACHED_SHOWN);
  },

  /** @private */
  _gotoUnattachedState: function () {
    this.set('viewState', SC.CoreView.UNATTACHED);
  },

  /** @private */
  _gotoUnattachedByParentState: function () {
    this.set('viewState', SC.CoreView.UNATTACHED_BY_PARENT);
  },

  /** @private */
  _gotoUnrenderedState: function () {
    this.set('viewState', SC.CoreView.UNRENDERED);
  },

  // ------------------------------------------------------------------------
  // Methods
  //

  /** @private Adds observers once a view has a layer. */
  _sc_addRenderedStateObservers: function () {
    var displayProperties,
      len, idx;

    // Register display property observers.
    displayProperties = this.get('displayProperties');
    for (idx = 0, len = displayProperties.length; idx < len; idx++) {
      this.addObserver(displayProperties[idx], this, this.displayDidChange);
    }

    // Begin observing isVisible & isFirstResponder.
    this.addObserver('isVisible', this, this._isVisibleDidChange);
    this.addObserver('isFirstResponder', this, this._isFirstResponderDidChange);
  },

  /** @private Called when an ancestor's parent changed. */
  _ancestorDidChangeParent: function () {
    // When an ancestor changes, the pane may have changed.
    this.notifyPropertyChange('pane');
  },

  /** @private Clear building in transition. */
  _cancelTransition: function () {
    // Cancel conflicting transitions. This causes the animation callback to fire.
    this.cancelAnimation();
    // this._teardownTransition();
  },

  /** @private */
  _doUpdateVisibleStyle: function () {
    var isVisible = this.get('isVisible');

    this.$().toggleClass('sc-hidden', !isVisible);
    this.$().attr('aria-hidden', isVisible ? null : true);

    // Reset that an update is required.
    this._visibleStyleNeedsUpdate = false;
  },

  /** @private Destroys the layer and updates the state. */
  _teardownLayer: function () {
    this._notifyWillDestroyLayer();

    var displayProperties,
      idx, len;

    // Unregister display property observers.
    displayProperties = this.get('displayProperties');
    for (idx = 0, len = displayProperties.length; idx < len; idx++) {
      this.removeObserver(displayProperties[idx], this, this.displayDidChange);
    }

    // Stop observing isVisible & isFirstResponder.
    this.removeObserver('isVisible', this, this._isVisibleDidChange);
    this.removeObserver('isFirstResponder', this, this._isFirstResponderDidChange);

    // Remove the layer reference.
    this.set('layer', null);

    // Update states after *will* and before *did* notifications!
    this._gotoUnrenderedState();
  },

  /** @private Attaches the view. */
  _executeDoAttach: function () {
    var notifyStack = []; // Only those views that changed state get added to the stack.

    // Run any queued updates.
    this._executeQueuedUpdates();

    // Update the state and children state. The children are updated top-down so that hidden or
    // unattached children allow us to bail out early.
    this._gotoSomeAttachedState();
    this._callOnChildViews('_parentDidAttach', true, notifyStack);

    // Notify for each child (that changed state) in reverse so that each child is in the proper
    // state before its parent potentially alters its state. For example, a parent could modify
    // children in `didAppendToDocument`.
    for (var i = notifyStack.length - 1; i >= 0; i--) {
      var childView = notifyStack[i];

      childView._notifyDidAttach();
    }
    this._notifyDidAttach();
  },

  /** @private Detaches the view and updates the state. */
  _executeDoDetach: function () {
    // Notify *will* (top-down from parent to children).
    this._notifyWillDetach();
    this._callOnChildViews('_parentWillRemoveFromDocument');

    // Detach the layer.
    var node = this.get('layer');
    node.parentNode.removeChild(node);

    // Update states after *will* and before *did* notifications!
    this._gotoUnattachedState();
    this._callOnChildViews('_parentDidRemoveFromDocument');
  },

  /** @private Hides the view. */
  _executeDoHide: function () {
    // UNUSED: Is it necessary for hiding/showing of a view to notify entire descendent tree?
    // var notifyStack = []; // Only those views that changed state get added to the stack.

    // The children are updated top-down so that hidden or unattached children allow us to bail out early.
    this._callOnChildViews('_parentWillHideInDocument', true); // , notifyStack

    // Notify for each child (that will change state) in reverse so that each child is in the proper
    // state before its parent potentially alters its state. For example, a parent could modify
    // children in `willHideInDocument`.
    // for (var i = notifyStack.length - 1; i >= 0; i--) {
    //   var childView = notifyStack[i];

    //   childView._notifyWillHideInDocument();
    // }
    this._notifyWillHideInDocument();

    // Update the visible style.
    this._doUpdateVisibleStyle();

    // Update the state and children state. The children are updated top-down so that hidden or
    // unattached children allow us to bail out early.
    this._gotoAttachedHiddenState();
    this._callOnChildViews('_parentDidHideInDocument', true); // , notifyStack

    // Notify for each child (that changed state) in reverse so that each child is in the proper
    // state before its parent potentially alters its state. For example, a parent could modify
    // children in `didHideInDocument`.
    // for (var i = notifyStack.length - 1; i >= 0; i--) {
    //   var childView = notifyStack[i];

    //   childView._notifyDidHideInDocument();
    // }
    this._notifyDidHideInDocument();
  },

  /** @private Render the view's layer. */
  _executeDoRender: function () {
    var notifyStack = []; // Only those views that changed state get added to the stack.

    // Render the layer.
    var context = this.renderContext(this.get('tagName'));

    this.renderToContext(context);
    this.set('layer', context.element());

    // Update the state and children state. The children are updated top-down so that invalid state
    // children allow us to bail out early.
    this._gotoUnattachedState();
    this._callOnChildViews('_parentDidRender', true, notifyStack);

    this._sc_addRenderedStateObservers();

    // Notify for each child (that changed state) in reverse so that each child is in the proper
    // state before its parent potentially alters its state. For example, a parent could modify
    // children in `didCreateLayer`.
    for (var i = notifyStack.length - 1; i >= 0; i--) {
      var childView = notifyStack[i];

      childView._notifyDidRender();
    }
    this._notifyDidRender();
  },

  /** @private Shows the view. */
  _executeDoShow: function () {
    // var notifyStack = []; // Only those views that changed state get added to the stack.

    // Update the visible style.
    this._doUpdateVisibleStyle();

    // Update the state and children state. The children are updated top-down so that hidden or
    // unattached children allow us to bail out early. This view's state is going to be transitioning,
    // but all child views are now considered shown.
    this._gotoAttachedShownState();
    this._callOnChildViews('_parentDidShowInDocument', true); // , notifyStack

    // Notify for each child (that changed state) in reverse so that each child is in the proper
    // state before its parent potentially alters its state. For example, a parent could modify
    // children in `didShowInDocument`.
    // for (var i = notifyStack.length - 1; i >= 0; i--) {
    //   var childView = notifyStack[i];

    //   childView._notifyDidShowInDocument();
    // }
    this._notifyDidShowInDocument();
  },

  /** @private Updates the layer. */
  _executeDoUpdateContent: function () {
    var mixins = this.renderMixin,
      context = this.renderContext(this.get('layer'));

    // If there is no update method, fallback to calling render with extra
    // firstTime argument set to false.
    if (!this.update) {
      this.render(context, false);
    } else {
      this.update(context.$());
    }

    // Call renderMixin methods.
    if (mixins) {
      var len = mixins.length;
      for (var idx = 0; idx < len; ++idx) {
        mixins[idx].call(this, context, false);
      }
    }

    // Call applyAttributesToContext so that subclasses that override it can
    // insert further attributes.
    this.applyAttributesToContext(context);

    context.update();

    // Legacy.
    this.set('layerNeedsUpdate', false);

    // Reset that an update is required.
    this._contentNeedsUpdate = false;

    // Notify.
    this.notifyPropertyChange('layer');
    if (this.didUpdateLayer) { this.didUpdateLayer(); }

    if (this.designer && this.designer.viewDidUpdateLayer) {
      this.designer.viewDidUpdateLayer(); //let the designer know
    }
  },

  /** @private */
  _executeQueuedUpdates: function () {

    // Update visibility style if necessary.
    if (this._visibleStyleNeedsUpdate) {
      this._doUpdateVisibleStyle();
    }

    // Update the content of the layer if necessary.
    if (this._contentNeedsUpdate) {
      this._executeDoUpdateContent();
    }
  },

  /** @private
    Marks the view as needing a visibility update if the isVisible property
    changes.

    This observer is connected when the view is attached and is disconnected
    when the view is detached.
  */
  _isVisibleDidChange: function () {
    if (this.get('isVisible')) {
      this._doShow();
    } else {
      this._doHide();
    }
  },

  /** @private
    Adds the 'focus' class to the view.

    This observer is connected when the view is attached and is disconnected
    when the view is detached.
  */
  _isFirstResponderDidChange: function () {
    var isFirstResponder = this.get('isFirstResponder');

    this.$().toggleClass('focus', isFirstResponder);
  },

  /** @private Attempts to call `didAppendToDocument` on the view. */
  _notifyDidAttach: function () {
    // If we don't have the layout module then we don't know the frame until appended to the document.
    this.notifyPropertyChange('frame');

    // Notify.
    if (this.didAppendToDocument) { this.didAppendToDocument(); }
  },

  /** @private Attempts to call `didHideInDocument` on the view. */
  _notifyDidHideInDocument: function () {
    if (this.didHideInDocument) { this.didHideInDocument(); }
  },

  /** @private Attempts to call `didCreateLayer` on the view. */
  _notifyDidRender: function () {
    var mixins = this.didCreateLayerMixin,
      idx, len;

    // Send notice that the layer was created.
    if (this.didCreateLayer) { this.didCreateLayer(); }
    if (mixins) {
      len = mixins.length;
      for (idx = 0; idx < len; ++idx) {
        mixins[idx].call(this);
      }
    }
  },

  /** @private Attempts to call `didShowInDocument` on the view. */
  _notifyDidShowInDocument: function () {
    if (this.didShowInDocument) { this.didShowInDocument(); }
  },

  /** @private Attempts to call `willDestroyLayer` on the view. */
  _notifyWillDestroyLayer: function () {
    var idx, len,
      mixins;

    mixins = this.willDestroyLayerMixin;
    if (mixins) {
      len = mixins.length;
      for (idx = 0; idx < len; ++idx) {
        mixins[idx].call(this);
      }
    }

    if (this.willDestroyLayer) { this.willDestroyLayer(); }
  },

  /** @private Attempts to call `willRemoveFromDocument` on the view. */
  _notifyWillDetach: function () {
    if (this.willRemoveFromDocument) { this.willRemoveFromDocument(); }
  },

  /** @private Attempts to call `willHideInDocument` on the view. */
  _notifyWillHideInDocument: function () {
    if (this.willHideInDocument) { this.willHideInDocument(); }
  },

  /** @private Attempts to call `willShowInDocument` on the view. */
  _notifyWillShowInDocument: function () {
    if (this.willShowInDocument) { this.willShowInDocument(); }
  },

  /** @private Routes according to parent did append. */
  _parentDidAttach: function (notifyStack) {
    var state = this.get('viewState'),
        shouldContinue = true;

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The child view was attached to the parent, which was unattached.
    // Result: Update the child and then move it to the proper attached state.
    case SC.CoreView.UNATTACHED_BY_PARENT:
      // Run any queued updates.
      this._executeQueuedUpdates();

      // Go to the proper state.
      this._gotoSomeAttachedState();

      // If there is a transition in, run it. TODO: Check state here?
      var transitionIn = this.get('transitionIn');
      if (transitionIn) {
        this._transitionIn(false);
      }

      break;

    // Scenario: The child is unrendered or unattached.
    // Result: The child would need to be forced into this state by its parent (otherwise it should
    //         be in an UNATTACHED_BY_PARENT state), so just leave it alone and don't notify.
    case SC.CoreView.UNRENDERED: // Render + attach?
    case SC.CoreView.UNATTACHED: // Attach?
      // There's no need to continue to further child views.
      shouldContinue = false;
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart is breaking assumptions.
      // All other states should be impossible if parent was UNATTACHED:
      // ATTACHED_BUILDING_IN, ATTACHED_SHOWING, ATTACHED_SHOWN, ATTACHED_SHOWN_ANIMATING, ATTACHED_BUILDING_OUT, ATTACHED_BUILDING_OUT_BY_PARENT, ATTACHED_HIDING, ATTACHED_HIDDEN, ATTACHED_HIDDEN_BY_PARENT
      SC.warn("Core Developer Warning: Found invalid state %@ for _parentDidAttach".fmt(this._viewStateString()));
      //@endif

      // There's no need to continue to further child views.
      shouldContinue = false;
    }

    if (shouldContinue) {
      // Allow children that have changed state to notify that they have been attached.
      notifyStack.push(this);
    }

    return shouldContinue;
  },

  /** @private Updates according to parent did cancel build out. */
  _parentDidCancelBuildOut: function () {
    var state = this.get('viewState');

    // If the view was building out because its parent was building out, attempt to reverse or
    // revert the transition.
    if (state === SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT) {
      var transitionIn = this.get('transitionIn');

      // Cancel the building out transition (in place if we are going to switch to transitioning back in).
      this.cancelAnimation(transitionIn ? SC.LayoutState.CURRENT : undefined);

      // Set the proper state.
      this._gotoAttachedShownState();

      if (transitionIn) {
        this._transitionIn(true);
      }

    // If the view was building out on its own or is hidden we can ignore it.
    } else if (state === SC.CoreView.ATTACHED_BUILDING_OUT || state &
      SC.CoreView.IS_HIDDEN) {
      // There's no need to continue to further child views.
      return false;
    }
  },

  /** @private Update child view states when the parent hides. Top-down! */
  _parentDidHideInDocument: function () { // notifyStack
    var state = this.get('viewState'),
        shouldContinue = false;

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The child view was shown.
    // Result: Go to hidden by parent state.
    case SC.CoreView.ATTACHED_SHOWN:
      // Go to the proper state.
      this._gotoAttachedHiddenByParentState();

      shouldContinue = true;
      break;

    // Scenario: The child view was hidden or forced to unrendered or unattached state.
    // Result: Do nothing.
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.ATTACHED_HIDDEN:
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart is breaking assumptions.
      // All animating states should have been canceled when parent will hide is called.
      // ATTACHED_HIDING, ATTACHED_BUILDING_IN, ATTACHED_SHOWING, ATTACHED_BUILDING_OUT, ATTACHED_BUILDING_OUT_BY_PARENT, UNATTACHED_BY_PARENT, ATTACHED_HIDDEN_BY_PARENT, ATTACHED_SHOWN_ANIMATING
      SC.warn("Core Developer Warning: Found invalid state %@ for _parentDidHideInDocument".fmt(this._viewStateString()));
      //@endif
    }

    // if (shouldContinue) {
    //   // Allow children that have changed state to notify that they have been hidden.
    //   notifyStack.push(this);
    // }

    return shouldContinue;
  },

  /** @private Routes according to parent did detach. */
  _parentDidRemoveFromDocument: function () {
    var state = this.get('viewState');

    if (state & SC.CoreView.IS_ATTACHED) {
      // Update states after *will* and before *did* notifications!
      this._gotoUnattachedByParentState();
    } else {
      // There's no need to continue to further child views.
      return false;
    }
  },

  /** @private Configure child views when parent did render. */
  _parentDidRender: function (notifyStack) {
    var state = this.get('viewState'),
        shouldContinue = true;

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The child view was unrendered and now is rendered.
    // Result: Add rendered state observers and move it to the proper rendered state.
    case SC.CoreView.UNRENDERED:
      this._sc_addRenderedStateObservers();

      // Go to the proper state.
      this._gotoUnattachedByParentState();
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart is breaking assumptions.
      // All other states should be impossible if parent was UNRENDERED:
      // ATTACHED_BUILDING_IN, ATTACHED_SHOWING, ATTACHED_SHOWN, ATTACHED_SHOWN_ANIMATING, ATTACHED_BUILDING_OUT, ATTACHED_BUILDING_OUT_BY_PARENT, ATTACHED_HIDING, ATTACHED_HIDDEN, ATTACHED_HIDDEN_BY_PARENT, UNATTACHED_BY_PARENT, UNATTACHED
      SC.warn("Core Developer Warning: Found invalid state %@ for _parentDidAttach".fmt(this._viewStateString()));
      //@endif

      // There's no need to continue to further child views.
      shouldContinue = false;
    }

    if (shouldContinue) {
      // Allow children that have changed state to notify that they have been rendered.
      notifyStack.push(this);
    }

    return shouldContinue;
  },

  /** @private Update child view states when the parent shows. Top-down! */
  _parentDidShowInDocument: function () { // notifyStack
    var state = this.get('viewState'),
        shouldContinue = true;

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The child view is only hidden because of the parent.
    // Result: Go to shown state. This will notify.
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT:
      this._gotoAttachedShownState();

      break;

    // Scenario: The child view is hidden on its own or has been forced to an unrendered or unattached state.
    // Result: Do nothing and don't notify.
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.ATTACHED_HIDDEN:
      // There's no need to continue to further child views.
      shouldContinue = false;
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart is breaking assumptions.
      // These states should be impossible if the parent was HIDDEN.
      // ATTACHED_SHOWN, ATTACHED_SHOWN_ANIMATING, ATTACHED_SHOWING, ATTACHED_HIDING, ATTACHED_BUILDING_IN, ATTACHED_BUILDING_OUT, ATTACHED_BUILDING_OUT_BY_PARENT
      // This state should be impossible if its parent was UNATTACHED (it should have been trimmed above):
      // UNATTACHED_BY_PARENT
      SC.warn("Core Developer Warning: Found invalid state %@ for _parentDidShowInDocument".fmt(this._viewStateString()));
      //@endif
      // There's no need to continue to further child views.
      shouldContinue = false;
    }

    // if (shouldContinue) {
    //   // Allow children that have changed state to notify that they have been made visible.
    //   notifyStack.push(this);
    // }

    return shouldContinue;
  },

  /** @private Starts building out view if appropriate. */
  _parentWillBuildOutFromDocument: function (owningView) {
    var state = this.get('viewState'),
      transitionOut = this.get('transitionOut');

    switch (state) {
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.UNATTACHED_BY_PARENT:
    case SC.CoreView.ATTACHED_BUILDING_OUT:
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT:
    case SC.CoreView.ATTACHED_HIDDEN:
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT:
    case SC.CoreView.ATTACHED_HIDING:
      // Notify *will* (top-down from parent to children).
      // this._notifyWillDetach();

      // There's no need to continue to further child views.
      return false;
    case SC.CoreView.ATTACHED_SHOWING:
    case SC.CoreView.ATTACHED_BUILDING_IN:
    case SC.CoreView.ATTACHED_SHOWN:
      // Notify *will* (top-down from parent to children).
      // this._notifyWillDetach();

      if (transitionOut) {
        this._owningView = owningView;

        // this.invokeNext(function () {
          this._transitionOut(false, owningView);
        // });

        // Update states after *will* and before *did* notifications!
        this._gotoAttachedBuildingOutByParentState();
      }
      return true;
    default:
    }
  },

  /** @private Prepares according to parent will hide. This is called before the parent view hides
    completely, which may be after a hide transition completes. */
  _parentWillHideInDocument: function () { // notifyStack
    var state = this.get('viewState'),
        shouldContinue = true;

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The child view is visible.
    // Result: Do nothing and continue.
    case SC.CoreView.ATTACHED_SHOWN:
      break;

    // Scenario: The child view is animating.
    // Result: Complete its animation immediately and continue.
    case SC.CoreView.ATTACHED_SHOWN_ANIMATING:
    case SC.CoreView.ATTACHED_SHOWING:
    case SC.CoreView.ATTACHED_BUILDING_IN:
    case SC.CoreView.ATTACHED_BUILDING_OUT:
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT:
    case SC.CoreView.ATTACHED_HIDING:
      this.cancelAnimation();
      break;

    // Scenario: The child view is hidden or has been forced to an unrendered or unattached state.
    // Result: Do nothing and don't notify.
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.ATTACHED_HIDDEN:
      // There's no need to continue to further child views.
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart is breaking assumptions.
      // This state should be impossible if its parent was UNATTACHED or HIDDEN/HIDING (it should have been trimmed above):
      // UNATTACHED_BY_PARENT, ATTACHED_HIDDEN_BY_PARENT
      SC.warn("Core Developer Warning: Found invalid state %@ for _parentWillHideInDocument".fmt(this._viewStateString()));
      //@endif
      // There's no need to continue to further child views.
      shouldContinue = false;
    }

    // if (shouldContinue) {
    //   // Allow children that have changed state to notify that they will be shown.
    //   notifyStack.push(this);
    // }

    return shouldContinue;
  },

  /** @private Clean up before parent is detached. */
  _parentWillRemoveFromDocument: function () {
    var state = this.get('viewState');

    switch (state) {
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.UNATTACHED_BY_PARENT:
      // There's no need to continue to further child views.
      return false;
    // Cancel any outstanding isVisible transitions and mark for visibility update.
    case SC.CoreView.ATTACHED_SHOWING:
    case SC.CoreView.ATTACHED_HIDING:
      this._cancelTransition();
      this._teardownTransition();
      this._visibleStyleNeedsUpdate = true;
      break;
    // Cancel any other outstanding transitions.
    case SC.CoreView.ATTACHED_BUILDING_IN:
    case SC.CoreView.ATTACHED_BUILDING_OUT:
    case SC.CoreView.ATTACHED_BUILDING_OUT_BY_PARENT:
      this._cancelTransition();
      this._teardownTransition();
      break;
    case SC.CoreView.ATTACHED_HIDDEN:
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT:
    case SC.CoreView.ATTACHED_SHOWN:
      break;
    default:
      // Attached and not in a transitionary state.
    }

    // Notify *will*.
    this._notifyWillDetach();
  },

  /** @private Prepares according to parent will show. */
  _parentWillShowInDocument: function (notifyStack) {
    var state = this.get('viewState'),
        shouldContinue = true;

    // Handle all 12 possible view states.
    switch (state) {

    // Scenario: The child view is only hidden because of the parent.
    // Result: Run queued updates. This will notify.
    case SC.CoreView.ATTACHED_HIDDEN_BY_PARENT:
      this._executeQueuedUpdates();

      break;

    // Scenario: The child view is hidden on its own or has been forced to an unrendered or unattached state.
    // Result: Do nothing and don't notify.
    case SC.CoreView.UNRENDERED:
    case SC.CoreView.UNATTACHED:
    case SC.CoreView.ATTACHED_HIDDEN:
      // There's no need to continue to further child views.
      shouldContinue = false;
      break;

    // Invalid states.
    default:
      //@if(debug)
      // Add some debugging only warnings for if the view statechart is breaking assumptions.
      // These states should be impossible if the parent was HIDDEN.
      // ATTACHED_SHOWN, ATTACHED_SHOWN_ANIMATING, ATTACHED_SHOWING, ATTACHED_HIDING, ATTACHED_BUILDING_IN, ATTACHED_BUILDING_OUT, ATTACHED_BUILDING_OUT_BY_PARENT
      // This state should be impossible if its parent was UNATTACHED (it should have been trimmed above):
      // UNATTACHED_BY_PARENT
      SC.warn("Core Developer Warning: Found invalid state %@ for _parentWillShowInDocument".fmt(this._viewStateString()));
      //@endif
      // There's no need to continue to further child views.
      shouldContinue = false;
    }

    if (shouldContinue) {
      // Allow children that have changed state to notify that they will be shown.
      notifyStack.push(this);
    }

    return shouldContinue;
  },

  /** @private */
  _setupTransition: function (transition) {
    // Get a copy of the layout.
    var layout = SC.clone(this.get('layout'));
    // Prepare for a transition.
    this._preTransitionLayout = layout;
    this._preTransitionFrame = this.get('borderFrame');
    // Cache appropriate layout values.
    var layoutProperties = SC.get(transition, 'layoutProperties');
    // If the transition specifies any layouts, cache them.
    if (layoutProperties && layoutProperties.length) {
      this._transitionLayoutCache = {};
      var i, prop, len = layoutProperties.length;
      for (i = 0; i < len; i++) {
        prop = layoutProperties[i];
        this._transitionLayoutCache[prop] = layout[prop] === undefined ? null : layout[prop];
      }
    }
  },

  /** @private */
  _teardownTransition: function () {
    // Make sure this isn't being called twice for the same transition. For example,
    // some transition plugins will send a didTransitionIn/Out event even if the
    // transition was cancelled.

    // If we have a hash of cached layout properties, adjust back to it.
    if (this._transitionLayoutCache) {
      this.adjust(this._transitionLayoutCache);
    }
    // Otherwise, just set the layout back to what it was.
    else if (this._preTransitionLayout) {
      this.set('layout', this._preTransitionLayout);
    }
    // Clean up.
    this._preTransitionLayout = null;
    this._preTransitionFrame = null;
    this._transitionLayoutCache = null;
  },

  /** @private Attempts to run a transition hide, ensuring any incoming transitions are stopped in place. */
  _transitionHide: function (inPlace) {
    var transitionHide = this.get('transitionHide'),
      options = this.get('transitionHideOptions') || {};

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _transitionHide()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    // switch (state) {
    // case SC.CoreView.ATTACHED_SHOWING:
    // case SC.CoreView.ATTACHED_BUILDING_IN:
    //   this.cancelAnimation(SC.LayoutState.CURRENT);
    //   inPlace = true;
    //   break;
    // default:
    if (!inPlace) {
      this._setupTransition(transitionHide);
    }
    // }

    // Set up the hiding transition.
    if (transitionHide.setup) {
      transitionHide.setup(this, options, inPlace);
    }

    // Execute the hiding transition.
    transitionHide.run(this, options, this._preTransitionLayout, this._preTransitionFrame);

    // Set the proper state.
    this._gotoAttachedHidingState();
  },

  /** @private Attempts to run a transition in, ensuring any outgoing transitions are stopped in place. */
  _transitionIn: function (inPlace) {
    var transitionIn = this.get('transitionIn'),
      options = this.get('transitionInOptions') || {};

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _transitionIn()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    if (!inPlace) {
      this._setupTransition(transitionIn);
    }

    // Set up the incoming transition.
    if (transitionIn.setup) {
      transitionIn.setup(this, options, inPlace);
    }

    // Execute the incoming transition.
    transitionIn.run(this, options, this._preTransitionLayout, this._preTransitionFrame);

    // Set the proper state.
    this._gotoAttachedBuildingInState();
  },

  /** @private Attempts to run a transition out, ensuring any incoming transitions are stopped in place. */
  _transitionOut: function (inPlace, owningView) {
    var transitionOut = this.get('transitionOut'),
      options = this.get('transitionOutOptions') || {};

    if (!inPlace) {
      this._setupTransition(transitionOut);
    }

    // Increment the shared building out count.
    owningView._buildingOutCount++;

    // Set up the outgoing transition.
    if (transitionOut.setup) {
      transitionOut.setup(this, options, inPlace);
    }

    // Execute the outgoing transition.
    transitionOut.run(this, options, this._preTransitionLayout, this._preTransitionFrame);
  },

  /** @private Attempts to run a transition show, ensuring any hiding transitions are stopped in place. */
  _transitionShow: function (inPlace) {
    var transitionShow = this.get('transitionShow'),
      options = this.get('transitionShowOptions') || {};

    //@if (debug)
    if (SC.LOG_VIEW_STATES) {
      SC.Logger.log('%c%@ — _transitionShow()'.fmt(this), SC.LOG_VIEW_STATES_STYLE[this.get('viewState')]);
    }
    //@endif

    if (!inPlace) {
      this._setupTransition(transitionShow);
    }

    // Set up the showing transition.
    if (transitionShow.setup) {
      transitionShow.setup(this, options, inPlace);
    }

    // Execute the showing transition.
    transitionShow.run(this, options, this._preTransitionLayout, this._preTransitionFrame);

    // Set the proper state.
    this._gotoAttachedShowingState();
  },

  /** @private Goes to the proper attached state depending on its parents state*/
  _gotoSomeAttachedState: function () {
    var parentView = this.get('parentView'),
      // Views without a parent are not limited by a parent's current state.
      isParentShown = parentView ? parentView.get('viewState') & SC.CoreView.IS_SHOWN : true;

    // Set the proper state.
    if (this.get('isVisible')) {
      if (isParentShown) {
        this._gotoAttachedShownState();
      } else {
        this._gotoAttachedHiddenByParentState();
      }
    } else {
      this._gotoAttachedHiddenState();
    }
  }

});
