var Promise = require('bluebird');

module.exports = function wrapper(initialWait, maxTries, opts) {
  require('amqp-delay.node')(opts.channel);

  // when requeuing the message, it shouldn't go to the original exchange, since it may be routed
  // to other queues that already processed it successfully; instead a new exchange is created
  // solely to publish messages to requeue to the failed queue
  var requeuerExchange = ['requeuer', opts.queue].join('.');
  var ok = opts.channel.assertExchange(requeuerExchange, 'fanout', {durable: true}).then(function () {
    return opts.channel.bindQueue(opts.queue, requeuerExchange, '#');
  });

  function errorHandler(err, msg) {
    msg.properties = msg.properties || {};
    msg.properties.headers = msg.properties.headers || {};
    msg.properties.headers.retries = msg.properties.headers.retries || 0; // 0 means never been retried before
    msg.properties.headers.retries++;

    if (msg.properties.headers.retries >= maxTries) {
      console.error(err, 'Message processing failed ' + maxTries + ' times');
    } else {
      return ok.then(function () {
        return opts.channel
          .delay(Math.pow(2, msg.properties.headers.retries) * 1000)
          .publish(requeuerExchange, msg.fields.routingKey, msg.content, msg.properties);
      });
    }
  }

  return function handlerWrapper(msg) {
    return Promise.resolve(msg).then(opts.handler).catch(function (err) {
      return Promise.resolve(msg).then(errorHandler.bind(null, err)).catch(function (err) {
        // requeue message if something goes wrong when processing the
        // errorneous message that requeues it with delay...
        opts.channel.nack(msg);
        throw err;
      }).then(function () {
        // ack message whether processed successfully or not (and no more retries)
        return opts.channel.ack(msg);
      });
    });
  };
};
