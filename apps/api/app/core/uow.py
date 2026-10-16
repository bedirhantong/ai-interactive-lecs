from typing import Protocol


class UnitOfWork(Protocol):
    """Transaction boundary. A SQLAlchemy Session satisfies it; services call commit() once per use case."""

    def commit(self) -> None: ...

    def rollback(self) -> None: ...
