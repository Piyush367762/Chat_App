import amqp from 'amqplib';

let channel;

export async function initRabbit() {
  if (!process.env.RABBITMQ_URL) return null;

  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertQueue('chat.messages', { durable: true });

  console.log('RabbitMQ connected');
  return channel;
}

export function publishChatMessage(message) {
  if (!channel) return;

  channel.sendToQueue(
    'chat.messages',
    Buffer.from(JSON.stringify(message)),
    { persistent: true }
  );
}
