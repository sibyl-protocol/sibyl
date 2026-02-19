"""Tests for src.chain — Solana on-chain integration (mocked RPC)."""

import hashlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.chain import (
    compute_discriminator,
    derive_protocol_pda,
    derive_market_pda,
    submit_resolve,
    PROGRAM_ID,
    PROTOCOL_SEED,
    MARKET_SEED,
)
from src.types import Outcome


class TestComputeDiscriminator:
    def test_resolve_discriminator(self):
        """Verify discriminator matches first 8 bytes of sha256('global:resolve')."""
        expected = hashlib.sha256(b"global:resolve").digest()[:8]
        assert compute_discriminator("resolve") == expected

    def test_different_instructions_differ(self):
        assert compute_discriminator("resolve") != compute_discriminator("initialize")

    def test_discriminator_length(self):
        assert len(compute_discriminator("resolve")) == 8


class TestDerivePda:
    def test_protocol_pda_is_valid(self):
        """derive_protocol_pda returns a valid pubkey and bump."""
        pda, bump = derive_protocol_pda()
        assert pda is not None
        assert 0 <= bump <= 255

    def test_protocol_pda_is_deterministic(self):
        pda1, bump1 = derive_protocol_pda()
        pda2, bump2 = derive_protocol_pda()
        assert pda1 == pda2
        assert bump1 == bump2

    def test_market_pda_is_valid(self):
        """derive_market_pda returns a valid pubkey and bump."""
        pda, bump = derive_market_pda(1)
        assert pda is not None
        assert 0 <= bump <= 255

    def test_market_pda_is_deterministic(self):
        pda1, _ = derive_market_pda(42)
        pda2, _ = derive_market_pda(42)
        assert pda1 == pda2

    def test_different_market_ids_different_pdas(self):
        pda1, _ = derive_market_pda(1)
        pda2, _ = derive_market_pda(2)
        assert pda1 != pda2


@pytest.mark.asyncio
async def test_submit_resolve_retries_on_failure(monkeypatch):
    """submit_resolve retries up to MAX_RETRIES and eventually raises."""
    from solders.keypair import Keypair
    from solders.hash import Hash
    mock_keypair = Keypair()

    monkeypatch.setenv("SOLANA_RPC_URL", "https://fake-rpc.test")

    mock_blockhash = MagicMock()
    mock_blockhash.value.blockhash = Hash.default()

    mock_client = AsyncMock()
    mock_client.get_latest_blockhash = AsyncMock(return_value=mock_blockhash)
    mock_client.send_transaction = AsyncMock(side_effect=Exception("RPC error"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("src.chain.load_keypair", return_value=mock_keypair), \
         patch("src.chain.AsyncClient", return_value=mock_client):
        with pytest.raises(Exception, match="RPC error"):
            await submit_resolve(1, Outcome.YES, 85)

    # Should have been called MAX_RETRIES (3) times
    assert mock_client.send_transaction.call_count == 3


@pytest.mark.asyncio
async def test_submit_resolve_success(monkeypatch):
    """submit_resolve returns tx signature on success."""
    from solders.keypair import Keypair
    from solders.hash import Hash
    mock_keypair = Keypair()

    monkeypatch.setenv("SOLANA_RPC_URL", "https://fake-rpc.test")

    mock_blockhash = MagicMock()
    mock_blockhash.value.blockhash = Hash.default()

    mock_send_resp = MagicMock()
    mock_send_resp.value = "fake-sig-123"

    mock_client = AsyncMock()
    mock_client.get_latest_blockhash = AsyncMock(return_value=mock_blockhash)
    mock_client.send_transaction = AsyncMock(return_value=mock_send_resp)
    mock_client.confirm_transaction = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("src.chain.load_keypair", return_value=mock_keypair), \
         patch("src.chain.AsyncClient", return_value=mock_client):
        sig = await submit_resolve(1, Outcome.YES, 85)

    assert sig == "fake-sig-123"
    assert mock_client.send_transaction.call_count == 1
