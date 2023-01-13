# setup.sh
dfx start --background --clean
dfx deploy nft --argument '(opt record{custodians=opt vec{principal"rwbxt-jvr66-qvpbz-2kbh3-u226q-w6djk-b45cp-66ewo-tpvng-thbkh-wae"}})'
dfx deploy assets
dfx canister call assets authorize "(principal  \"rwbxt-jvr66-qvpbz-2kbh3-u226q-w6djk-b45cp-66ewo-tpvng-thbkh-wae\")"
