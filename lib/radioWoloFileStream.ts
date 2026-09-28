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

  function closeController(
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) {
    if (cancelled || finished) {
      return;
    }

    finished = true;

    try {
      controller.close();
    } catch {
      // The response consumer or framework may already have closed the stream.
    }
  }

  function errorController(
    controller: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
  ) {
    if (cancelled || finished) {
      return;
    }

    finished = true;

    try {
      controller.error(error);
    } catch {
      // Teardown won the race; there is no remaining consumer to notify.
    }
  }

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
          closeController(
            controller,
          );

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
            closeController(
              controller,
            );

            await closeHandle();

            return;
          }

          position +=
            bytesRead;

          try {
            controller.enqueue(
              buffer.subarray(
                0,
                bytesRead,
              ),
            );
          } catch {
            cancelled = true;
            await closeHandle();
            return;
          }

          if (
            position > end &&
            !cancelled &&
            !finished
          ) {
            closeController(
              controller,
            );

            await closeHandle();
          }
        } catch (
          error
        ) {
          if (
            !cancelled &&
            !finished
          ) {
            errorController(
              controller,
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
