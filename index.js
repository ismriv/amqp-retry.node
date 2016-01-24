var Promise = require('bluebird');

module.exports = function wrapper(initialDelay, retries, opts) {
  require('amqp-delay.node')(opts.channel);

  // when requeuing the message, it shouldn't go to the original exchange, since it may be routed
  // to other queues that already processed it successfully; instead a new exchange is created
  // solely to publish messages to requeue to the failed queue
  var retryExchange = ['retry', opts.queue].join('.');
  var ok = opts.channel.assertExchange(retryExchange, 'fanout', {durable: true}).then(function () {
    return opts.channel.bindQueue(opts.queue, retryExchange, '#');
  });

  function errorHandler(err, msg) {
    msg.properties = msg.properties || {};
    msg.properties.headers = msg.properties.headers || {};
    msg.properties.headers.retries = msg.properties.headers.retries || 0; // 0 means never been retried before
    msg.properties.headers.retries++;

    return Promise.resolve(msg).then(function () {
      if (msg.properties.headers.retries >= retries) {
        return err;
      } else {
        ok = ok.then(function () {
          return opts.channel
            .delay(Math.pow(2, msg.properties.headers.retries - 1) * initialDelay)
            .publish(retryExchange, msg.fields.routingKey, msg.content, msg.properties);
        });

        return ok.then(function () {
          return null;
        });
      }
    });
  }

  function retry(err, msg) {
    return Promise.resolve(msg).then(errorHandler.bind(null, err, msg)).catch(function (err) {
      // requeue message if something goes wrong when processing the erroneous
      // message that requeues it with delay...
      opts.channel.nack(msg);
      throw err;
    }).then(function (err) {
      if (err) {
        // reject without requeuing if message handling failed after all retries
        opts.channel.reject(msg, false);
        return opts.handler(err, msg, opts.channel);
      }

      opts.channel.ack(msg); // ack message if processed successfully
    });
  }

  // extend channel to explicitly allow message retrying
  opts.channel.retry = retry;

  return function handlerWrapper(msg) {
    return Promise.resolve(msg).then(function () {
      return opts.handler(null, msg, opts.channel);
    }).catch(function (err) {
      return retry(err, msg);
    });
  };
};
