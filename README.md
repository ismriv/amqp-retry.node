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

    function handleMessage(err, msg, channel) {
      if (err) {
        // failed after all retries, and message is already rejected
        // add your own error handling
        console.error(err, 'Message processing failed');
      }

      // messages that generate an exception (or a rejected promise) will be retried
      throw new Error('Boom!');

      // calling retry explicitly will also retry message
      channel.retry(new Error('Boom!'), msg);

      // ack message when message is processed successfully
      channel.ack(msg);

      // or simply discard message in case no retry is needed
      channel.reject(msg);
    }

    ok = ok.then(function () {
      return channel.assertQueue('bar', {durable: true, autoDelete: false});
    });

    ok = ok.then(function () {
      var initialDelay = 4000;
      var retries = 5;

      // without retry: channel.consume('bar', handleMessage, [options])
      return channel.consume('bar', retry(initialDelay, retries, {
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

## License

[MIT](http://opensource.org/licenses/MIT) © Ismael Rivera

[npm-image]: https://img.shields.io/npm/v/amqp-retry.node.svg?style=flat
[npm-url]: https://npmjs.org/package/amqp-retry.node
