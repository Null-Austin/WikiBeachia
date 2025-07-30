#!/bin/bash

while true; do
  read -p "This will install the latest pull. This may not be a finished version, do you want to continue? (y/n): " choice
  case "$choice" in
    y|Y|yes|YES)
      git pull
      npm install
      npm start
      break
      ;;
    n|N|no|NO)
      echo "You chose no! Aborting."
      break
      ;;
    *)
      echo "Invalid input. Please type y or n."
      ;;
  esac
done