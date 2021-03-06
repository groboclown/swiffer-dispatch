var uuid = require('uuid');
var util = require('util');

var ScheduleAction = function (name, input, config) {
  this._name = name;
  this._input = JSON.stringify(input);
  this._activityConfig = config;
};

ScheduleAction.prototype.getDecision = function () {
  return {
    decisionType: 'ScheduleActivityTask',
    scheduleActivityTaskDecisionAttributes: {
      activityId: this._name,
      activityType: {
        name: this._activityConfig.typeName || this._name,
        version: this._activityConfig.version,
      },
      input: this._input,
      scheduleToStartTimeout: this._activityConfig.scheduleToStartTimeout ? this._activityConfig.scheduleToStartTimeout
        .toString() : '60',
      scheduleToCloseTimeout: this._activityConfig.scheduleToCloseTimeout ? this._activityConfig.scheduleToCloseTimeout
        .toString() : '360',
      startToCloseTimeout: this._activityConfig.startToCloseTimeout ?
        this._activityConfig.startToCloseTimeout.toString() : '300',
      heartbeatTimeout: this._activityConfig.heartbeatTimeout ? this._activityConfig.heartbeatTimeout.toString() : '60'

    }
  };
};

var ScheduleLambdaAction = function (name, functionName, input, config) {
  this._name = name;
  this._input = JSON.stringify(input);
  this._functionName = functionName;
  this._functionConfig = config;
};

ScheduleLambdaAction.prototype.getDecision = function () {
  return {
    decisionType: 'ScheduleLambdaFunction',
    scheduleLambdaFunctionDecisionAttributes: {
      id: this._name,
      name: this._functionName,
      input: this._input,
      startToCloseTimeout: this._functionConfig.startToCloseTimeout ?
        this._functionConfig.startToCloseTimeout.toString() : '300',
    }
  };
};

var ExitWorkflowAction = function (details) {
  this.exitValues = JSON.stringify(details);

  // A very special marker to indicate that this action won't trigger
  // a response from the server.
  this.nonAction = true;
};

ExitWorkflowAction.prototype.getDecision = function () {
  // Not an actual action.
  return null;
};

var RecordMarkerAction = function (name, details) {
  this._name = name;
  this._details = JSON.stringify(details);

  // A very special marker to indicate that this action won't trigger
  // a response from the server.
  this.nonAction = true;
};

RecordMarkerAction.prototype.getDecision = function () {
  return {
    decisionType: 'RecordMarker',
    recordMarkerDecisionAttributes: {
      markerName: this._name,
      details: this._details
    }
  };
};


var TimerAction = function (name, delay) {
  this._name = name;
  this._delay = delay;
};

TimerAction.prototype.getDecision = function () {
  return {
    decisionType: 'StartTimer',
    startTimerDecisionAttributes: {
      control: this._name,
      startToFireTimeout: String(this._delay),
      timerId: uuid.v1()
    }
  };
};

var CancelTimerAction = function (timerStartedEvent) {
  this._timerId = timerStartedEvent.attributes.timerId;
};

CancelTimerAction.prototype.getDecision = function () {
  return {
    decisionType: 'CancelTimer',
    cancelTimerDecisionAttributes: {
      timerId: this._timerId
    }
  };
};


var ChildWorkflowAction = function (name, workflowName, version, input, config) {
  this._name = name;
  this._workflowName = workflowName;
  this._input = JSON.stringify(input);
  this._config = config || {};
  this._version = version;
};

ChildWorkflowAction.prototype.getDecision = function () {
  return {
    decisionType: 'StartChildWorkflowExecution',
    startChildWorkflowExecutionDecisionAttributes: {
      input: this._input,
      control: this._name,
      workflowType: {
        name: this._workflowName,
        version: this._version
      },
      workflowId: uuid.v1(),
      childPolicy: this._config.childPolicy,
      executionStartToCloseTimeout: this._config.executionStartToCloseTimeout,
      lambdaRole: this._config.lambdaRole,
      tagList: this._config.tagList,
      taskList: (this._config.taskList ? { name: this._config.taskList } : undefined),
      taskPriority: this._config.taskPriority,
      taskStartToCloseTimeout: this._config.taskStartToCloseTimeout
    }
  };
};

var FatalError = function (msg, details) {
  this.message = msg;
  this.details = details;
  this.name = 'FatalError';
  Error.call(this, msg);
};

util.inherits(FatalError, Error);

FatalError.prototype.getDetails = function () {
  return this.details;
};

var FatalErrorAction = function (reason, details) {
  this._reason = reason;
  this._details = details;
};

FatalErrorAction.prototype.getDecision = function () {
  throw new FatalError(this._reason, this._details);
};

/**
 * This is returned when a task has been scheduled/started but not yet completed.
 * We don't want to go to the next task so we return this Noop to tell a
 * Series pipeline to stop.
 */
var Noop = function () {
  // Note that a no-op does not set the nonAction flag.
};
Noop.prototype.getDecision = function () {
  return null;
};
module.exports = {
  ScheduleAction: ScheduleAction,
  ScheduleLambdaAction: ScheduleLambdaAction,
  RecordMarkerAction: RecordMarkerAction,
  ExitWorkflowAction: ExitWorkflowAction,
  TimerAction: TimerAction,
  Noop: Noop,
  FatalErrorAction: FatalErrorAction,
  CancelTimerAction: CancelTimerAction,
  ChildWorkflowAction: ChildWorkflowAction
};
