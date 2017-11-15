const { PassThrough } = require("stream");

const { Client } = require("azure-event-hubs");

const connect = async (client, output) => {
  await client.open();

  const partitionIds = await client.getPartitionIds();

  partitionIds.forEach(async id => {
    const receiver = await client.createReceiver("$Default", id, {
      startAfterTime: Date.now()
    });

    receiver.on("errorReceived", err => console.warn("receiver error:", err));
    receiver.on("message", msg => output.write(msg.body));
  });
};

module.exports = (connectionString, path = null) => {
  const client = Client.fromConnectionString(connectionString, path);

  const passThrough = new PassThrough({
    objectMode: true
  });

  client.open();
  connect(client, passThrough);

  return passThrough;
};
