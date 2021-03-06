var util = require('util');
var Poller = require('../utils/poller');
var _ = require('underscore');
var EventList = require('./eventList');
var Promise = require('bluebird');
var fs = require('fs');

var Decider = function (pipeline, client, config) {
  this._pipeline = pipeline;
  if (typeof config.taskList === 'string') {
    config.taskList = { name: config.taskList };
  }
  // Ensure that the request order is set correctly
  config.reverseOrder = false;
  Poller.call(this, client, config);

  this._pollMethod = 'pollForDecisionTask';
};

util.inherits(Decider, Poller);

Decider.prototype._getPages = function (data, events) {
  var self = this;
  var config = _.clone(this._config);

  events = events || [];
  events = events.concat(data.events);

  if (data.nextPageToken) {
    config.nextPageToken = data.nextPageToken;
    return this._client.pollForDecisionTaskAsync(config).then(function (nextPageData) {
      return self._getPages(nextPageData, events);
    });
  } else {
    return Promise.resolve(events);
  }
};

Decider.prototype._handleTask = function (data) {
  // Anything that wants to be aware of a decision being received, should
  // listen to this event.
  this.emit('decider', data);
  
  var self = this;
  if (!_.isArray(data.events)) {
    this.emit('error', new Error('Invalid decision task data!'));
    return;
  }

  this._getPages(data).then(function (events) {
    events.domain = self._config.domain;
    events.workflowExecution = data.workflowExecution;
    return self._handleEvents(data.taskToken, events);
  }).catch(function (err) {
    self.emit('error', err);
  }).done();
};

Decider.prototype._handleEvents = function (taskToken, events) {
  var list = new EventList(events);
  var actions = this._pipeline.getNextActions(list);
  var decisions = [];
  
  this.emit('actions', actions);
  
  // Load up the actions, even if there are no actions.  This is done to
  // allow a end-of-workflow if it ends on a non-action (an action that won't
  // trigger a re-entry into the decider).
  try {
    actions.forEach(function (action) {
      var decision = action.getDecision();
      if (decision) {
        decisions.push(decision);
      }
    });
  } catch (err) {
    if (err.name === 'FatalError') {
      this.emit('failure', err);
      // Fail the execution
      decisions = [{
        decisionType: 'FailWorkflowExecution',
        failWorkflowExecutionDecisionAttributes: {
          reason: err.message
        }
      }];
    } else {
      // Otherwise just throw it so we don't actually respond with decisions. Probably a code
      // error that needs to be fixed so we can let the decision task time out and try again.
      throw err;
    }
  }
  if (!hasActionableActions(actions)) {
    // We finished all of the pipes (nothing to do, but wait, would be an action.Noop).
    decisions.push({
      decisionType: 'CompleteWorkflowExecution',
      completeWorkflowExecutionDecisionAttributes: {
        result: getWorkflowCompleteMessage(actions)
      }
    });
  }

  // If anything cares about the decisions going out to SWF...
  this.emit('decisions', decisions);

  return this._client.respondDecisionTaskCompletedAsync({
    taskToken: taskToken,
    decisions: decisions
  });
};


// TODO move into actions?
function hasActionableActions(actions) {
  if (actions) {
    for (var i = 0; i < actions.length; i++) {
      if (!actions[i].nonAction) {
        return true;
      }
    }
  }
  return false;
}

function getWorkflowCompleteMessage(actions) {
  // Find the last exit value message.
  for (var i = actions.length; --i >= 0;) {
    if (actions.exitValues) {
      return actions.exitValues;
    }
  }
  return 'All tasks completed successfully.';
}

module.exports = Decider;
