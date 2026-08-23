export class ChallengeConflictError
  extends Error {
  status: number;

  constructor(
    message: string,
    status = 409,
  ) {
    super(
      message,
    );

    this.name =
      "ChallengeConflictError";

    this.status =
      status;
  }
}
