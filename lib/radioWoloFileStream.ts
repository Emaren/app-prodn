import {
  open,
} from "node:fs/promises";

const RADIO_STREAM_CHUNK_BYTES =
  256 * 1024;

export async function createRadioFileStream(
  target: string,
  start: number,
  end: number,
) {
  const handle =
    await open(
      target,
      "r",
    );

  let position =
    start;

  let cancelled =
    false;

  let finished =
    false;

  let handleClosed =
    false;

  async function closeHandle() {
    if (handleClosed) {
      return;
    }

    handleClosed = true;

    await handle
      .close()
      .catch(
        () => undefined,
      );
  }

  return new ReadableStream<Uint8Array>(
    {
      async pull(
        controller,
      ) {
        if (
          cancelled ||
          finished
        ) {
          return;
        }

        const remaining =
          end -
          position +
          1;

        if (
          remaining <= 0
        ) {
          finished = true;

          controller.close();

          await closeHandle();

          return;
        }

        const buffer =
          Buffer.allocUnsafe(
            Math.min(
              RADIO_STREAM_CHUNK_BYTES,
              remaining,
            ),
          );

        try {
          const {
            bytesRead,
          } =
            await handle.read(
              buffer,
              0,
              buffer.byteLength,
              position,
            );

          if (
            cancelled ||
            finished
          ) {
            return;
          }

          if (
            bytesRead <= 0
          ) {
            finished = true;

            controller.close();

            await closeHandle();

            return;
          }

          position +=
            bytesRead;

          controller.enqueue(
            buffer.subarray(
              0,
              bytesRead,
            ),
          );

          if (
            position > end &&
            !cancelled &&
            !finished
          ) {
            finished = true;

            controller.close();

            await closeHandle();
          }
        } catch (
          error
        ) {
          if (
            !cancelled &&
            !finished
          ) {
            finished = true;

            controller.error(
              error,
            );
          }

          await closeHandle();
        }
      },

      async cancel() {
        cancelled = true;

        await closeHandle();
      },
    },
  );
}
