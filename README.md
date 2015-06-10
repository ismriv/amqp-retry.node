# amqp-retry.node
[![NPM version][npm-image]][npm-url]

Retry failed attempts to consume a message, with increasing delays between each attempt.

## Install
```sh
$ npm install amqp-retry.node --save
```

## Usage
```javascript
var amqp = require('amqplib');
var retry = require('amqp-retry.node');

amqp.connect().then(function(conn) {
  return conn.createChannel().then(function (channel) {
    require('amqp-delay.node')(channel);
    var ok = channel.assertExchange('foo', 'fanout', {durable: true});

    function handleMessage(msg) {
      console.log(msg);

      // no need to 'ack' or 'nack' messages
      // messages that generate an exception (or a rejected promise) will be retried
      throw new Error('Boom!');
    }

    ok = ok.then(function () {
      return channel.assertQueue('bar', {durable: true, autoDelete: false});
    });

    ok = ok.then(function () {
      var initialDelay = 4000;
      var limit = 5;

      // without retry: channel.consume('bar', handleMessage, [options])
      return channel.consume('bar', retry(initialDelay, limit, {
        channel: channel,
        queue: 'bar',
        handler: handleMessage
      }));
    });

    return ok.then(function () {
      console.log('[*] Waiting for messages. To exit press CTRL+C.');
    });
  });
}).then(null, console.warn);
```

[npm-image]: https://img.shields.io/npm/v/amqp-retry.node.svg?style=flat
[npm-url]: https://npmjs.org/package/amqp-retry.node
