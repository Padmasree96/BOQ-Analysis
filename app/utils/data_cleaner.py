import pandas as pd
from loguru import logger


def clean_dataframe_structure(df: pd.DataFrame) -> pd.DataFrame:
    """Clean a raw DataFrame extracted from Excel for processing."""
    # Drop completely empty rows and columns
    df = df.dropna(how="all")
    df = df.dropna(axis=1, how="all")

    # Reset index
    df = df.reset_index(drop=True)

    # Convert all column names to strings
    df.columns = [str(c).strip() for c in df.columns]

    # Strip whitespace from string cells
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].apply(
                lambda x: str(x).strip() if pd.notna(x) else ""
            )

    logger.debug(f"Cleaned DataFrame: {df.shape[0]} rows x {df.shape[1]} cols")
    return df
