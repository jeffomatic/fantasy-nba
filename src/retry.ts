export async function retry<T>(
  retries: number,
  func: () => Promise<T>,
): Promise<T> {
  let timeout = 1000;

  while (true) {
    try {
      return await func();
    } catch (e) {
      console.log(`error: ${e}`);
      console.log('backtrace:');
      console.log(e.stack);

      if (retries === 0) {
        console.log('no more retries!');
        throw e;
      }

      console.log(`retrying in ${timeout} ms...`);
      await new Promise((resolve, _) => setTimeout(resolve, timeout));
      retries--;
      timeout *= 2;
    }
  }
}
