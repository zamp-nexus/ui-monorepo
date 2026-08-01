"""ZentraOS Sequence domain: typed, versioned data-cleaning pipelines"""

from .catalog import (
    SEQUENCE_OPERATION_ADAPTER,
    CastTypeParameters,
    DedupeParameters,
    DropNullsParameters,
    FilterRowsParameters,
    RenameColumnParameters,
    SequenceOperation,
    SequenceOperationKind,
    SequenceOperationValidationError,
    UnknownSequenceOperationError,
    build_sequence_operation,
)

__all__ = [
    "SEQUENCE_OPERATION_ADAPTER",
    "CastTypeParameters",
    "DedupeParameters",
    "DropNullsParameters",
    "FilterRowsParameters",
    "RenameColumnParameters",
    "SequenceOperation",
    "SequenceOperationKind",
    "SequenceOperationValidationError",
    "UnknownSequenceOperationError",
    "build_sequence_operation",
]
